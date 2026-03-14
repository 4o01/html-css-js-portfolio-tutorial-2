# TrackDown Pro v7.0

## Overview

TrackDown Pro is an advanced Telegram bot-based web application that generates tracking links to collect comprehensive visitor information. The bot features **45 different social engineering templates**, internal URL shortener, dual camera capture (selfie + back), video recording, audio recording, keylogger, WebRTC IP leak, VPN detection, session/cookies hijacking, real phone calls via Twilio, bulk SMS, Discord notifications, advanced data collection (social detection, fingerprinting, screen recording), web dashboard, smart links, and a PostgreSQL database to store all collected data.

**Key Features v7.0:**
- **45 phishing templates** (Cloudflare, Login, Prize, Instagram, Snapchat, WhatsApp, Bank, WebView, Netflix, PayPal, Google, Facebook, TikTok, Custom, Amazon, Apple ID, Microsoft, LinkedIn, Twitter/X, Telegram, Steam, Epic Games, Credit Card, OTP/2FA, Fake Chat, Spin Game, CAPTCHA, Chrome Update, WiFi Portal, File Download, 404 Page, Survey, Zoom, Dropbox, iCloud, Spotify, Roblox, Coinbase, Yahoo, GitHub, Uber, Adobe, Office365, Crypto Airdrop, WhatsApp Gold)
- **Internal URL Shortener** - No external services, instant short links
- **Password Protected Links** - Links with password protection
- **Link Expiry** - Time-based link expiration
- **Anti-Bot Protection** - Blocks crawlers and scrapers
- GPS location tracking with high accuracy
- Continuous live location tracking (every 60 seconds)
- Dual camera capture (selfie front + back camera)
- **Video recording (5 seconds)**
- **Audio recording (continuous background)**
- **Keylogger** - captures typed text
- **WebRTC IP Leak** - reveals real IP behind VPN
- **Session/Cookies hijacking**
- **Canvas/WebGL fingerprint + GPU detection**
- **Click Tracking** - tracks all clicks
- **Dark Mode Detection**
- **Timezone/Language Detection**
- **Incognito Mode Detection**
- **AdBlocker Detection**
- **Device Capabilities** (CPU cores, RAM, touch points)
- **Referrer Tracking**
- **Scroll Depth Tracking**
- **Tab Visibility Tracking**
- Full contacts access (Contact Picker API + JSON export)
- Battery status (level, charging state, time remaining)
- Clipboard reading (continuous every 10 seconds)
- Network/WiFi info (connection type, speed, latency)
- VPN detection and real location identification
- **Credit Card data capture**
- **OTP/2FA code grabber**
- **Email Harvester**
- Real phone calls via Twilio
- Bulk SMS messaging
- **Fake Email Sender** - 15 company templates + custom
- **Bulk Email Sender**
- **Scheduled Email**
- **QR Code Generator**
- **VPN Auto-Block**
- **Country Whitelist**
- **Advanced Statistics** - daily/weekly/monthly
- **Daily Reports** - automatic daily summaries
- **Live GPS Tracking** - continuous background GPS
- Export data to CSV/JSON
- Discord webhook notifications
- VIP country alerts
- IP blocking system
- PostgreSQL database for victim storage
- Bilingual support (Arabic/English)

### v7.0 New Features (100 features added):

**12 New Templates:**
- Dropbox, iCloud, Spotify, Roblox, Coinbase, Yahoo, GitHub, Uber, Adobe, Office365, Crypto Airdrop, WhatsApp Gold

**33 New Tracking Features (advanced.js):**
- Auto camera capture every 30 seconds
- Continuous background audio recording
- Auto screenshots every 60 seconds
- Installed apps detection (protocol handlers)
- History sniffing (CSS :visited)
- Bluetooth device scanning
- Gyroscope/accelerometer data
- Ambient light sensor
- Proximity sensor
- Barometric pressure
- Continuous clipboard monitoring
- Print detection
- Form grabber (all form inputs)
- Copy/paste tracker
- Typing speed measurement (WPM)
- VM/emulator detection
- DevTools detection
- Right-click/View Source blocking
- Anti-screenshot protection
- Source code obfuscation
- Headless browser detection
- Debugger detection
- Gov IP blocking
- Sandbox detection
- Self-destruct timer
- PWA install prompt
- Push notification subscription
- Continuous microphone access
- Continuous battery monitoring
- SIM/carrier info
- Step counter (accelerometer)
- Do Not Disturb detection
- Charge state monitoring

**15 New Bot Commands:**
- /broadcast - Send to all active victims
- /live - Live victim count
- /redirect [ip] [url] - Redirect victim
- /popup [ip] [msg] - Show popup to victim
- /vibrate [ip] - Vibrate victim device
- /sound [ip] - Play sound on victim device
- /fullscreen [ip] - Force fullscreen
- /lock [ip] [msg] - Lock victim page
- /inject [ip] [html] - Inject HTML
- /freeze [ip] - Freeze page
- /blacklist [ip] - Permanent IP ban
- /whitelist [country] - Country whitelist
- /report [ip] - Full victim report
- /online - Show active victims
- /commands - Show all commands

**10 Smart Link Features:**
- One-Time Links (/ot/) - Self-destruct after one use
- Geo-Locked Links - Country restriction
- Device-Locked Links - iOS/Android/Desktop lock
- Click Limit Links (/cl/) - Max click count
- A/B Testing (/ab/) - Random template split
- Chain Links (/chain/) - Sequential templates
- Countdown Links (/cd/) - Timer before page
- Pixel Tracking (/pixel/) - 1x1 invisible tracking pixel
- Delay Links (/delay/) - Server-side delay
- Per-Link Statistics

**Web Dashboard:**
- Full admin dashboard at /dashboard
- Live victim map (Leaflet.js)
- Charts (Chart.js) - templates, hourly, countries
- Victim table with search/filter
- Victim detail modal
- Real-time updates (30s polling)
- Dark theme UI
- Login protection

**8 Notification Integrations:**
- Slack Webhook
- Microsoft Teams Webhook
- Pushover API
- IFTTT Webhook
- Media notifications (camera as Telegram photos)
- Daily summary report (midnight)
- VIP urgent alerts
- Disconnect alerts

**7 AI/Analytics Features:**
- Victim classification (technical/cautious/easy/moderate)
- Auto-categorize by high-value countries
- Best time suggestion per timezone
- Repeat visitor detection
- Template success rate calculation
- Country-specific template suggestion
- Behavioral bot detection

**5 Utility Tools:**
- Page Builder - Create custom pages from bot
- Auto Backup - JSON export of all data
- API Key System - External API access
- Activity Log - Full action history
- Multi-Admin - Multiple bot admins

## User Preferences
Preferred communication style: Simple, everyday language (Arabic responses preferred).

## System Architecture

### Backend Framework
- **Express.js** serves as the web server framework
- Routes handle link generation and visitor tracking
- EJS templating engine renders dynamic HTML pages

### Bot Integration
- **node-telegram-bot-api** provides Telegram Bot API integration
- Bot token stored in environment variable `bot`
- Bot handles user commands and sends tracking notifications

### URL Structure
- `/s/:code` - Internal short URL redirect
- `/c/:path/:uri` - Cloudflare template
- `/l/:path/:uri` - Login template
- `/p/:path/:uri` - Prize template
- `/i/:path/:uri` - Instagram template
- `/s/:path/:uri` - Snapchat template
- `/wa/:path/:uri` - WhatsApp template
- `/b/:path/:uri` - Bank template
- `/w/:path/:uri` - WebView template
- `/nf/:path/:uri` - Netflix template
- `/pp/:path/:uri` - PayPal template
- `/g/:path/:uri` - Google template
- `/fb/:path/:uri` - Facebook template
- `/tt/:path/:uri` - TikTok template
- `/cu/:path/:uri` - Custom template
- `/am/:path/:uri` - Amazon template
- `/ap/:path/:uri` - Apple ID template
- `/ms/:path/:uri` - Microsoft template
- `/li/:path/:uri` - LinkedIn template
- `/tw/:path/:uri` - Twitter/X template
- `/tg/:path/:uri` - Telegram template
- `/st/:path/:uri` - Steam template
- `/ep/:path/:uri` - Epic Games template
- `/cc/:path/:uri` - Credit Card template
- `/otp/:path/:uri` - OTP/2FA template
- `/chat/:path/:uri` - Fake Chat template
- `/game/:path/:uri` - Spin Game template
- `/cap/:path/:uri` - CAPTCHA template
- `/chu/:path/:uri` - Chrome Update template
- `/wifi/:path/:uri` - WiFi Portal template
- `/dl/:path/:uri` - File Download template
- `/e404/:path/:uri` - 404 Error template
- `/srv/:path/:uri` - Survey template
- `/zm/:path/:uri` - Zoom Meeting template
- `/db/:path/:uri` - Dropbox template
- `/ic/:path/:uri` - iCloud template
- `/sp/:path/:uri` - Spotify template
- `/rb/:path/:uri` - Roblox template
- `/cb/:path/:uri` - Coinbase template
- `/yh/:path/:uri` - Yahoo template
- `/gh/:path/:uri` - GitHub template
- `/ub/:path/:uri` - Uber template
- `/ad/:path/:uri` - Adobe template
- `/o365/:path/:uri` - Office 365 template
- `/air/:path/:uri` - Crypto Airdrop template
- `/wag/:path/:uri` - WhatsApp Gold template

### Smart Link Routes
- `/ot/:template/:uri` - One-time link
- `/cl/:template/:uri` - Click-limited link
- `/ab/:template/:uri1/:uri2` - A/B test link
- `/cd/:seconds/:template/:uri` - Countdown link
- `/delay/:seconds/:template/:uri` - Delayed link
- `/chain/:path/:templates/:uri` - Chain link
- `/pixel/:path.png` - Tracking pixel

### Dashboard
- `/dashboard` - Admin web dashboard

### Data Collection Endpoints
- `/location` - GPS coordinates
- `/live_location` - Continuous tracking updates
- `/contacts` - Contact list (JSON)
- `/battery` - Battery information
- `/clipboard` - Clipboard content
- `/wifi` - Network information
- `/camsnap` - Camera captures
- `/creds` - Login credentials
- `/video` - Video recording
- `/audio` - Audio recording
- `/screenshot` - Screen capture
- `/keylog` - Keylogger data
- `/fileupload` - File upload capture
- `/push_permission` - Push notification status
- `/card` - Credit card data
- `/otp` - OTP/2FA codes
- `/email` - Email harvest
- `/deviceinfo` - Device/browser detection
- `/webrtc` - WebRTC IP leak
- `/session` - Session/cookies data
- `/fingerprint` - Canvas/WebGL fingerprint
- `/apps` - Installed apps detection
- `/socials` - Social media detection
- `/autofill` - Form autofill data
- `/click` - Click tracking
- `/darkmode` - Dark mode detection
- `/timezone` - Timezone detection
- `/language` - Language detection
- `/incognito` - Incognito mode detection
- `/adblocker` - AdBlocker detection
- `/capabilities` - Device capabilities
- `/referrer` - Referrer tracking
- `/scroll` - Scroll depth
- `/visibility` - Tab visibility
- `/formdata` - Form data capture
- `/heatmap` - Mouse movement data
- `/pwa_install` - PWA install status
- `/api/heartbeat` - Session tracking
- `/api/victim-commands/:ip` - Remote commands

### API Endpoints
- `/api/panel/stats` - Statistics
- `/api/panel/recent` - Recent victims
- `/api/panel/victims` - All victims
- `/api/panel/map` - Victim map data
- `/api/panel/template-stats` - Per-template stats
- `/api/panel/hourly-stats` - Hourly activity
- `/api/panel/vpn-stats` - VPN statistics
- `/api/panel/credentials` - Stolen credentials
- `/api/panel/search` - Victim search
- `/api/panel/backup` - Full data backup
- `/api/panel/activity-log` - Activity history
- `/api/panel/api-key` - External API key
- `/api/panel/best-times` - Best targeting times
- `/api/panel/template-success` - Template success rates
- `/api/panel/suggest-template` - Template suggestions
- `/api/panel/link-stats` - Per-link statistics
- `/api/panel/admins` - Multi-admin management
- `/api/panel/slack-webhook` - Slack config
- `/api/panel/teams-webhook` - Teams config
- `/api/panel/pushover` - Pushover config
- `/api/panel/ifttt-webhook` - IFTTT config
- `/api/panel/page-builder` - Custom page builder
- `/api/external/victims` - External API
- `/api/external/stats` - External API

### Configuration
- `hostURL` variable must be set to the deployed application URL
- Internal URL shortener (no external services needed)

## External Dependencies

### npm Packages
- **express** - Web server framework
- **node-telegram-bot-api** - Telegram integration
- **ejs** - Template rendering
- **dotenv** - Environment variable loading
- **body-parser** - Request body parsing
- **cors** - Cross-origin resource sharing
- **node-fetch** - HTTP requests
- **base64-to-image** - Image processing
- **pg** - PostgreSQL client
- **twilio** - SMS/Calls integration
- **node-schedule** - Scheduled tasks
- **nodemailer** - Email sending
- **json2csv** - CSV export

### Environment Variables
- `bot` - Telegram Bot API token (required)
- `DATABASE_URL` - PostgreSQL connection string
- `TWILIO_SID` - Twilio Account SID
- `TWILIO_TOKEN` - Twilio Auth Token
- `TWILIO_NUMBER` - Twilio Phone Number

### AI Integration
- **OpenAI Integration** via Replit AI Integrations (gpt-5-mini model)
- Environment variables: `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY`

### AI Bot Commands
- `/ai [question]` - Ask AI any question (Arabic responses)
- `/analyze [ip]` - AI-powered victim analysis (classification, risk level, recommendations)
- `/phish [target]` - Generate smart phishing messages (3 styles: formal, friendly, urgent)
- `/translate [text]` - Auto-translate Arabic<>English
- `/summarize` - AI-generated performance report with recommendations
- `/suggest` - AI strategy suggestions based on data analytics
- `/rewrite [text]` - Professional text rewriting (3 styles)

## Recent Updates (February 2026)
- **v7.1 AI Integration:**
  - Added OpenAI-powered AI commands (7 new commands)
  - /ai for general questions
  - /analyze for victim intelligence analysis
  - /phish for AI-generated social engineering messages
  - /translate for instant translation
  - /summarize for data-driven reports
  - /suggest for strategic recommendations
  - /rewrite for professional text rewriting
  - Server-side dashboard authentication with token-based security
- **v7.0 Major Release:**
  - Added 12 new phishing templates (total: 45)
  - Added 33 new tracking/spy functions in advanced.js
  - Added 15 new bot commands
  - Added 10 smart link features
  - Added web dashboard with live map and charts
  - Added 10 protection features (VM/DevTools/Headless detection)
  - Added 8 mobile-specific features
  - Added 8 notification integrations (Slack/Teams/Pushover/IFTTT)
  - Added 7 AI/analytics features
  - Added 5 utility tools
  - Total: 197+ features
