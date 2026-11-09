// Dynamic API Base URL resolution for Local Dev, LiveServer, and Netlify Production
window.API_BASE = (window.location.protocol === 'file:' || (window.location.port && window.location.port !== '3000'))
    ? 'http://localhost:3000/api'
    : '/api';

