#!/usr/bin/env node

// 測試腳本 - 驗證用戶隔離功能
// 使用方法: node test_user_isolation.js

const fetch = require('node-fetch');

// 測試用的 JWT tokens (實際應從後端生成)
const USER1_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJlbWFpbCI6Im1pbmdrdW4xOTk5QGdtYWlsLmNvbSIsInN1YnNjcmlwdGlvbl9wbGFuIjoiZnJlZSIsImV4cCI6MTc1OTUwNDAxNSwiaWF0IjoxNzU4ODk5MjE1fQ.l56bbBEUs0DTd9r1PAWaSFmyyouDpws7rdi1AHmVX5A";
const USER2_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoyLCJlbWFpbCI6ImNvenluZXN0OTk2QGdtYWlsLmNvbSIsInN1YnNjcmlwdGlvbl9wbGFuIjoiZnJlZSIsImV4cCI6MTc1OTUwNDY1MywiaWF0IjoxNzU4ODk5ODUzfQ.6pzNX0eET80L9n2l-gj2uDacSGU8aRlxYhgO_bZ_xYg";

const GATEWAY_URL = 'http://localhost:3002';

async function testUserIsolation() {
  console.log('🔒 測試用戶隔離功能...\n');

  // 測試 1: 用戶1獲取狀態
  console.log('📊 測試1: 用戶1獲取狀態');
  try {
    const response1 = await fetch(`${GATEWAY_URL}/status`, {
      headers: { 'Authorization': `Bearer ${USER1_TOKEN}` }
    });
    const data1 = await response1.json();
    console.log('✅ 用戶1狀態:', data1);
  } catch (err) {
    console.error('❌ 用戶1狀態獲取失敗:', err.message);
  }

  // 測試 2: 用戶2獲取狀態
  console.log('\n📊 測試2: 用戶2獲取狀態');
  try {
    const response2 = await fetch(`${GATEWAY_URL}/status`, {
      headers: { 'Authorization': `Bearer ${USER2_TOKEN}` }
    });
    const data2 = await response2.json();
    console.log('✅ 用戶2狀態:', data2);
  } catch (err) {
    console.error('❌ 用戶2狀態獲取失敗:', err.message);
  }

  // 測試 3: 用戶1獲取QR
  console.log('\n🔲 測試3: 用戶1獲取QR');
  try {
    const response3 = await fetch(`${GATEWAY_URL}/qr`, {
      headers: { 'Authorization': `Bearer ${USER1_TOKEN}` }
    });
    const data3 = await response3.json();
    console.log('✅ 用戶1 QR:', { 
      user_id: data3.user_id, 
      ready: data3.ready, 
      has_qr: !!data3.qr,
      qr_length: data3.qr ? data3.qr.length : 0
    });
  } catch (err) {
    console.error('❌ 用戶1 QR獲取失敗:', err.message);
  }

  // 測試 4: 用戶2獲取QR
  console.log('\n🔲 測試4: 用戶2獲取QR');
  try {
    const response4 = await fetch(`${GATEWAY_URL}/qr`, {
      headers: { 'Authorization': `Bearer ${USER2_TOKEN}` }
    });
    const data4 = await response4.json();
    console.log('✅ 用戶2 QR:', { 
      user_id: data4.user_id, 
      ready: data4.ready, 
      has_qr: !!data4.qr,
      qr_length: data4.qr ? data4.qr.length : 0
    });
  } catch (err) {
    console.error('❌ 用戶2 QR獲取失敗:', err.message);
  }

  // 測試 5: 未授權存取
  console.log('\n🚫 測試5: 未授權存取（應該失敗）');
  try {
    const response5 = await fetch(`${GATEWAY_URL}/status`);
    const data5 = await response5.json();
    if (response5.status === 401) {
      console.log('✅ 正確拒絕未授權請求:', data5.error);
    } else {
      console.log('❌ 未正確拒絕未授權請求:', data5);
    }
  } catch (err) {
    console.error('❌ 未授權測試失敗:', err.message);
  }

  // 測試 6: 無效 token
  console.log('\n🚫 測試6: 無效 token（應該失敗）');
  try {
    const response6 = await fetch(`${GATEWAY_URL}/status`, {
      headers: { 'Authorization': 'Bearer invalid-token' }
    });
    const data6 = await response6.json();
    if (response6.status === 401) {
      console.log('✅ 正確拒絕無效 token:', data6.error);
    } else {
      console.log('❌ 未正確拒絕無效 token:', data6);
    }
  } catch (err) {
    console.error('❌ 無效 token 測試失敗:', err.message);
  }

  console.log('\n🎉 用戶隔離測試完成！');
}

// 運行測試
testUserIsolation().catch(console.error);
