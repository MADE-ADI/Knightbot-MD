// Change this import statement
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const crypto = require('crypto')

global.crypto = require('crypto')
async function connectToWhatsApp() {
  // Menyiapkan state untuk autentikasi
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  
  // Membuat koneksi Baileys
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true, // Aktifkan QR code
    browser: ['Chrome', 'Desktop', '10.0.0'],
    version: [2, 2323, 4],
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
  });
  
  sock.ev.on('creds.update', saveCreds);
  
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log('QR Code tersedia, silakan scan dengan WhatsApp Anda');
      // Opsional: Tampilkan QR code di terminal atau simpan sebagai gambar
    }
    
    if (connection === 'open') {
      console.log('Berhasil terhubung!');
      // Lakukan sesuatu setelah terhubung
    } else if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Koneksi terputus karena ', lastDisconnect?.error);
      if (shouldReconnect) {
        console.log('Mencoba menghubungkan kembali...');
        setTimeout(connectToWhatsApp, 5000); // Tunggu 5 detik sebelum mencoba lagi
      }
    }
  });
  
  return sock;
}

connectToWhatsApp().catch(err => console.log('Error:', err));