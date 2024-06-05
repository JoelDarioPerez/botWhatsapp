const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// Creamos una nueva instancia del cliente de WhatsApp Web
const client = new Client();

// Cuando el cliente está listo, ejecutamos este código (solo una vez)
client.on('ready', () => {
  console.log('¡El cliente está listo!');
});

// Escuchamos todos los mensajes entrantes
client.on('message_create', (message) => {
  // Verificamos si el mensaje recibido es "!ping"
  if (message.body === '!ping') {
    // Respondemos al chat donde se recibió el mensaje con "pong"
    message.reply('pong');
  }
});

// Cuando el cliente recibe el código QR, generamos y mostramos el código en la terminal
client.on('qr', (qr) => {
  qrcode.generate(qr, { small: true });
});
//
// Iniciamos el cliente de WhatsApp Web
client.initialize();
