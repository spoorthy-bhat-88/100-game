# The 100 Game - Multiplayer Card Game

A real-time multiplayer card game built with React and Socket.io.

## Play Online
[Add your deployed URL here after deployment]

## Local Development

### Prerequisites
- Node.js (v16 or higher)
- npm

### Installation
```bash
npm install
```

### Running Locally
```bash
npm run dev:all
```

This will start:
- Frontend on http://localhost:5173
- Backend on http://localhost:3001

## Deployment

### Backend (Render)
1. Create a new Web Service on [Render](https://render.com)
2. Connect your GitHub repository
3. Set root directory to `server`
4. Set build command: `npm install`
5. Set start command: `npm start`
6. Add environment variable: `CLIENT_URL` = your frontend URL

### Frontend (Vercel/Netlify)
1. Create a new project on [Vercel](https://vercel.com) or [Netlify](https://netlify.com)
2. Connect your GitHub repository
3. Set build command: `npm run build`
4. Set output directory: `dist`
5. Add environment variable: `VITE_SERVER_URL` = your backend URL

## Game Rules
- 2-5 players can play
- Goal: Play all cards from 1 to 100 in ascending order
- Two piles: cards must be placed in ascending order
- Special move: Play a lower card if it's within 10 of the pile's top
- Limited hints to help coordinate plays

## Technologies
- React 18
- Socket.io
- Vite
- Express
- Node.js
