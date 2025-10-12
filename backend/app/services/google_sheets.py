
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from sqlalchemy.orm import Session
from app.services.settings import SettingsService
from fastapi import HTTPException
import logging
import asyncio
from app.routers.auth import GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET # Import from auth router
from google.auth.transport.requests import Request as GoogleAuthRequest # Import and alias Request

logger = logging.getLogger(__name__)

class GoogleSheetsService:
    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id
        self.settings_service = SettingsService(self.db)

    async def _get_credentials(self):

        access_token = self.settings_service.get_setting_for_user("google_sheets_access_token", self.user_id)
        refresh_token = self.settings_service.get_setting_for_user("google_sheets_refresh_token", self.user_id)
        token_expires_in = self.settings_service.get_setting_for_user("google_sheets_token_expires_in", self.user_id)

        if not access_token or not refresh_token:
            raise HTTPException(status_code=401, detail="Google Sheets not connected for this user.")

        credentials = Credentials(
            token=access_token,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=GOOGLE_CLIENT_ID, # Use imported CLIENT_ID
            client_secret=GOOGLE_CLIENT_SECRET, # Use imported CLIENT_SECRET
            scopes=["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive.readonly"]
        )

        # Check if token needs refreshing (simple check, could be more robust)
        # For simplicity, we'll assume the token is valid for now and rely on google-auth to refresh if needed
        # A more robust solution would store expires_at timestamp
        if credentials.expired and credentials.refresh_token:
            logger.info(f"Refreshing Google Sheets token for user {self.user_id}")
            try:
                # Use a background task or run in executor to avoid blocking main thread
                await asyncio.to_thread(credentials.refresh, request=GoogleAuthRequest())
                self.settings_service.save_setting_for_user("google_sheets_access_token", credentials.token, self.user_id)
                # Only save refresh token if it changes (rarely happens)
                if credentials.refresh_token and credentials.refresh_token != refresh_token:
                    self.settings_service.save_setting_for_user("google_sheets_refresh_token", credentials.refresh_token, self.user_id)
                logger.info(f"Google Sheets token refreshed for user {self.user_id}")
            except Exception as e:
                logger.error(f"Failed to refresh Google Sheets token for user {self.user_id}: {e}")
                # Consider invalidating tokens if refresh fails persistently
                raise HTTPException(status_code=401, detail="Failed to refresh Google Sheets token.")

        return credentials

    async def list_spreadsheets(self):
        credentials = await self._get_credentials()
        try:
            drive_service = build('drive', 'v3', credentials=credentials)
            results = await asyncio.to_thread(
                drive_service.files().list(
                    q="mimeType='application/vnd.google-apps.spreadsheet'",
                    spaces='drive',
                    fields="nextPageToken, files(id, name)"
                ).execute
            )
            items = results.get('files', [])
            return [{'id': item['id'], 'name': item['name']} for item in items]
        except HttpError as err:
            logger.error(f"Google Drive API error listing spreadsheets: {err}")
            if err.resp.status == 401:
                raise HTTPException(status_code=401, detail="Unauthorized to access Google Drive. Please reconnect.")
            raise HTTPException(status_code=500, detail=f"Google Drive API error: {err}")
        except Exception as e:
            logger.error(f"Failed to list spreadsheets: {e}")
            raise HTTPException(status_code=500, detail="Internal server error listing spreadsheets")

    async def get_sheet_tabs(self, spreadsheet_id: str):
        credentials = await self._get_credentials()
        try:
            sheets_service = build('sheets', 'v4', credentials=credentials)
            spreadsheet_metadata = await asyncio.to_thread(
                sheets_service.spreadsheets().get(
                    spreadsheetId=spreadsheet_id
                ).execute
            )
            sheets = spreadsheet_metadata.get('sheets', [])
            return [sheet['properties']['title'] for sheet in sheets]
        except HttpError as err:
            logger.error(f"Google Sheets API error getting tabs for {spreadsheet_id}: {err}")
            if err.resp.status == 401:
                raise HTTPException(status_code=401, detail="Unauthorized to access Google Sheet. Please reconnect.")
            if err.resp.status == 404:
                raise HTTPException(status_code=404, detail="Spreadsheet not found.")
            raise HTTPException(status_code=500, detail=f"Google Sheets API error: {err}")
        except Exception as e:
            logger.error(f"Failed to get sheet tabs for {spreadsheet_id}: {e}")
            raise HTTPException(status_code=500, detail="Internal server error getting sheet tabs")

    async def read_sheet_data(self, spreadsheet_id: str, sheet_name: str):
        credentials = await self._get_credentials()
        try:
            sheets_service = build('sheets', 'v4', credentials=credentials)
            range_name = f"{sheet_name}"
            result = await asyncio.to_thread(
                sheets_service.spreadsheets().values().get(
                    spreadsheetId=spreadsheet_id, range=range_name
                ).execute
            )
            values = result.get('values', [])
            if not values:
                return {"headers": [], "data": []}
            
            headers = values[0]
            data = values[1:]
            
            # Convert data to list of dictionaries
            formatted_data = []
            for row in data:
                row_dict = {}
                for i, header in enumerate(headers):
                    row_dict[header] = row[i] if i < len(row) else None
                formatted_data.append(row_dict)
            
            return {"headers": headers, "data": formatted_data}

        except HttpError as err:
            logger.error(f"Google Sheets API error reading data from {spreadsheet_id}/{sheet_name}: {err}")
            if err.resp.status == 401:
                raise HTTPException(status_code=401, detail="Unauthorized to access Google Sheet. Please reconnect.")
            if err.resp.status == 404:
                raise HTTPException(status_code=404, detail="Sheet or range not found.")
            raise HTTPException(status_code=500, detail=f"Google Sheets API error: {err}")
        except Exception as e:
            logger.error(f"Failed to read sheet data from {spreadsheet_id}/{sheet_name}: {e}")
            raise HTTPException(status_code=500, detail="Internal server error reading sheet data")
