# KeyCreator

## Development Setup

### Local Development
1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. The server will prompt you for your ERPNext session ID:
   - Log in to https://erp-test.finkzeit.at in your browser
   - Copy the `sid` cookie value from your browser's developer tools
   - Paste it when prompted by the server

4. Open http://localhost:3000 in your browser - the app should work!

**Alternative ways to set session ID:**
- Environment variable: `SESSION_ID=your_session_id npm run dev`
- API call: `curl -X POST http://localhost:3000/api/set-session -H "Content-Type: application/json" -d '{"sessionId": "your_session_id"}'`

### Production Deployment
When hosted on the same domain as ERPNext, the app works out of the box - no additional setup required.

---

## About

KeyCreator is a web app for creating and managing RFID transponder keys with ERPNext as backend.

- Works out of the box when hosted on the same domain as ERPNext
- Local development with interactive session setup
- Test mode can be toggled in the UI to mark keys as test keys

## Usage

1. Connect the RFID reader
2. Select a company from the dropdown
3. Enter the key number
4. Place RFID cards on the reader to create or format keys
5. Toggle test mode as needed for test key creation

---

No build step required for production. Just deploy the static files to your web server. 