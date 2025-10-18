import asyncio
import sys
from telethon import TelegramClient


async def run_test(api_id: int, api_hash: str, phone: str):
    client_name = f"test_client_{phone}"
    client = TelegramClient(client_name, api_id, api_hash)
    await client.connect()
    try:
        print("Sending code request to:", phone)
        sent = await client.send_code_request(phone)
        print("send_code_request returned:", repr(sent))
        phone_code_hash = getattr(sent, 'phone_code_hash', None)
        print("phone_code_hash:", phone_code_hash)

        code = input("Enter the code you received: ")
        try:
            if phone_code_hash:
                me = await client.sign_in(phone, code=code, phone_code_hash=phone_code_hash)
            else:
                me = await client.sign_in(phone, code=code)
            print("Signed in user:", getattr(me, 'username', None), getattr(me, 'id', None))
            # print session string
            sess_str = client.session.save()
            print("session string (save this securely):", sess_str)
        except Exception as e:
            print("Sign-in failed:", e)
    finally:
        await client.disconnect()


if __name__ == '__main__':
    if len(sys.argv) < 4:
        print("Usage: python scripts/test_telegram.py <api_id> <api_hash> <phone> [send-only]")
        sys.exit(1)
    api_id = int(sys.argv[1])
    api_hash = sys.argv[2]
    phone = sys.argv[3]
    send_only = False
    if len(sys.argv) >= 5 and sys.argv[4] in ('send-only', '--send-only', '-s'):
        send_only = True

    async def main():
        client_name = f"test_client_{phone}"
        client = TelegramClient(client_name, api_id, api_hash)
        await client.connect()
        try:
            print("Sending code request to:", phone)
            sent = await client.send_code_request(phone)
            print("send_code_request returned:", repr(sent))
            phone_code_hash = getattr(sent, 'phone_code_hash', None)
            print("phone_code_hash:", phone_code_hash)
            if send_only:
                return
            code = input("Enter the code you received: ")
            try:
                if phone_code_hash:
                    me = await client.sign_in(phone, code=code, phone_code_hash=phone_code_hash)
                else:
                    me = await client.sign_in(phone, code=code)
                print("Signed in user:", getattr(me, 'username', None), getattr(me, 'id', None))
                sess_str = client.session.save()
                print("session string (save this securely):", sess_str)
            except Exception as e:
                print("Sign-in failed:", e)
        finally:
            await client.disconnect()

    asyncio.run(main())


