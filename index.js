'use strict';

const express    = require('express');
const line       = require('@line/bot-sdk');
const axios      = require('axios');

const app = express();

const config = {
  channelAccessToken : process.env.LINE_ACCESS_TOKEN,
  channelSecret      : process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);

// ============================================================
// Webhook受信
// ============================================================
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.status(200).json({ status: 'ok' }))
    .catch(err => {
      console.error(err);
      res.status(200).json({ status: 'ok' });
    });
});

// ============================================================
// イベント振り分け
// ============================================================
async function handleEvent(event) {
  if (event.type === 'follow') {
    return handleFollow(event);
  }
  if (event.type === 'message' && event.message.type === 'text') {
    return handleText(event);
  }
  return Promise.resolve(null);
}

// ============================================================
// 友だち追加時
// ============================================================
async function handleFollow(event) {
  const userId = event.source.userId;
  console.log('follow:', userId);

  await logToGas(userId, 'follow', '友だち追加', '');

  return client.replyMessage(event.replyToken, {
    type: 'text',
    text:
      'LIVE引越しサービスの公式LINEへようこそ！\n\n' +
      '引越し費用がLINEで今すぐわかります。\n' +
      'お得なキャンペーン情報も配信中です！\n\n' +
      'メニューから「概算見積もり」をタップしてください。'
  });
}

// ============================================================
// テキストメッセージ受信時
// ============================================================
async function handleText(event) {
  const userId = event.source.userId;
  const text   = event.message.text;

  console.log('message:', userId, text);
  await logToGas(userId, 'message', text, '');

  let reply = '';

  if (text.includes('見積') || text.includes('料金') || text.includes('いくら')) {
    reply =
      '概算見積もりはこちらから無料でご確認いただけます！\n\n' +
      '【概算見積もりフォーム】\n' +
      process.env.LIFF_URL + '\n\n' +
      '正式なお見積りは訪問またはお電話にてご案内します。\n' +
      'お気軽にどうぞ！';

  } else if (text.includes('電話') || text.includes('連絡') || text.includes('相談')) {
    reply =
      'お問い合わせありがとうございます！\n\n' +
      '担当者より折り返しご連絡いたします。\n' +
      'しばらくお待ちください。';
    await logToGas(userId, 'contact', text, '要対応');

  } else {
    reply =
      'メッセージありがとうございます！\n\n' +
      '概算見積もりや引越しのご相談はお気軽にどうぞ。\n' +
      '担当者より順次ご連絡いたします。';
  }

  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: reply
  });
}

// ============================================================
// LIFFフォームからの送信受信（CORS対応）
// ============================================================
app.use(express.json());

app.options('/estimate', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.status(200).end();
});

app.post('/estimate', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const data = req.body;
  const userId   = data.userId   || '';
  const name     = data.name     || '';
  const fromAddr = data.from     || '';
  const toAddr   = data.to       || '';
  const moveDate = data.moveDate || '';
  const truck    = data.truck    || '';
  const estimate = data.estimate || '';

  console.log('estimate received:', data);

  // スプレッドシート・メール通知をGASへ転送
  await logToGas(userId, 'estimate', name, JSON.stringify(data));

  // お客様へLINEで受付完了メッセージ送信
  if (userId) {
    await client.pushMessage(userId, {
      type: 'text',
      text:
        name + ' 様\n\n' +
        'お見積もりのご依頼ありがとうございます！\n\n' +
        '【受付内容】\n' +
        '出発：'         + fromAddr + '\n' +
        '到着：'         + toAddr   + '\n' +
        '引越し日：'     + moveDate + '\n' +
        '推奨トラック：' + truck    + '\n' +
        '概算金額：'     + estimate + '\n\n' +
        '担当者より改めてご連絡いたします。\n' +
        'しばらくお待ちください！'
    });
  }

  res.status(200).json({ status: 'ok' });
});

// ============================================================
// GAS（スプレッドシート記録・メール通知）へ転送
// ============================================================
async function logToGas(userId, type, content, detail) {
  const gasUrl = process.env.GAS_URL;
  if (!gasUrl) return;

  try {
    await axios.post(gasUrl, { userId, type, content, detail });
  } catch (err) {
    console.error('logToGas error:', err.message);
  }
}

// ============================================================
// サーバー起動
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('LINE Bot server running on port ' + PORT);
});
