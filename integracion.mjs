import axios from "axios";
import CryptoJS from "crypto-js";
import dotenv from "dotenv";
import moment from "moment";
import { parseString } from "xml2js";
import dgram from "dgram";
import qrcode from "qrcode-terminal";
import { Client } from "whatsapp-web.js";

dotenv.config();

const apiid = process.env.APPID;
const secretKey = process.env.SECRETKEY;
const url = process.env.URLASSISTCARGO;
const password = process.env.PASSWORD;
const userId = process.env.USUARIOASSISTCARGO;
const account = "globaltracker";
const apiUrl = process.env.APIURL;
const ipMdlz = process.env.IPMDLZ;
const puertoMdlz = process.env.PORTMDLZ;

const states = {
  FXRX62: "0",
  GKGH77: "0",
  GZKH94: "0",
  DPRL96: "0",
};

let accessToken = null;
let tokenRecursoSeguro = null;
let imei = ["000009170482863"];

const client = new Client({
  webVersionCache: {
    type: "remote",
    remotePath:
      "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
  },
});

client.once("ready", () => {
  console.log("¡El cliente está listo!");
});

client.on("message_create", (message) => {
  const msgParts = message.body.toUpperCase().split(",");
  const [license, event] = msgParts;

  if (states.hasOwnProperty(license)) {
    states[license] = event;
    message.reply(`Estado ${license} actualizado a: ${event}`);
  } else if (license === "EVENTOS") {
    const eventStatus = Object.entries(states)
      .map(([key, value]) => `Estado ${key} actualizado a: ${value}`)
      .join("\n");
    message.reply(eventStatus);
  } else {
    console.log("Mensaje random");
  }
});

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

client.initialize();

function obtenerTokenWanWay() {
  const currentTimeUnix = Math.floor(new Date().getTime() / 1000);
  const signatureString = CryptoJS.MD5(secretKey) + currentTimeUnix;
  const twiceEncrypt = CryptoJS.MD5(signatureString).toString();

  const datos = {
    appid: apiid,
    time: currentTimeUnix,
    signature: twiceEncrypt,
  };

  axios
    .post(`${apiUrl}/auth`, datos)
    .then((response) => {
      accessToken = response.data.accessToken;
      console.log("Token WanWay obtenido:", accessToken);
    })
    .catch((error) => {
      console.error("Error en la autenticación WanWay:", error);
    });
}

function obtenerTokenRecursoSeguro() {
  const xmlData = `
    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
      xmlns:tem="http://tempuri.org/">
      <soapenv:Header/>
      <soapenv:Body>
        <tem:GetUserToken>
          <tem:userId>${userId}</tem:userId>
          <tem:password>${password}</tem:password>
        </tem:GetUserToken>
      </soapenv:Body>
    </soapenv:Envelope>
  `;

  const config = {
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: `http://tempuri.org/IRCService/GetUserToken`,
    },
  };

  axios
    .post(url, xmlData, config)
    .then((response) => {
      parseString(response.data, { explicitArray: false }, (err, result) => {
        if (err) {
          console.error("Error al analizar la respuesta XML:", err);
        } else {
          const aTokenValue =
            result?.["s:Envelope"]?.["s:Body"]?.GetUserTokenResponse
              ?.GetUserTokenResult?.["a:token"];

          if (aTokenValue) {
            tokenRecursoSeguro = aTokenValue;
            console.log("Token Recurso Seguro obtenido:", tokenRecursoSeguro);
          } else {
            console.error("No se pudo encontrar 'a:token' en la respuesta.");
          }
        }
      });
    })
    .catch((error) => {
      console.error("Error en la autenticación Recurso Seguro:", error);
    });
}

function sendPosition(position) {
  const date = moment.unix(position.gpsTime).format("YYYY-MM-DDTHH:mm:ss");
  const evento = states[position.licenseNumber] || "0";
  const xmlData = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
      xmlns:tem="http://tempuri.org/"
      xmlns:iron="http://schemas.datacontract.org/2004/07/IronTracking">
      <soapenv:Header/>
      <soapenv:Body>
        <tem:GPSAssetTracking>
          <tem:token>${tokenRecursoSeguro}</tem:token>
          <tem:events>
            <iron:Event>
              <iron:altitude>0</iron:altitude>
              <iron:asset>${position.licenseNumber}</iron:asset>
              <iron:battery>0</iron:battery>
              <iron:code>${evento}</iron:code>
              <iron:course>0</iron:course>
              <iron:customer>
                <iron:id>0</iron:id>
                <iron:name>${position.userName}</iron:name>
              </iron:customer>
              <iron:date>${date}</iron:date>
              <iron:direction>0</iron:direction>
              <iron:humidity>0</iron:humidity>
              <iron:ignition>${position.accStatus}</iron:ignition>
              <iron:latitude>${position.lat}</iron:latitude>
              <iron:longitude>${position.lng}</iron:longitude>
              <iron:odometer/>
              <iron:serialNumber>1</iron:serialNumber>
              <iron:shipment/>
              <iron:speed>${position.speed}</iron:speed>
              <iron:temperature></iron:temperature>
            </iron:Event>
          </tem:events>
        </tem:GPSAssetTracking>
      </soapenv:Body>
    </soapenv:Envelope>`;

  axios
    .post(url, xmlData, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `http://tempuri.org/IRCService/GPSAssetTracking`,
      },
    })
    .then((response) => {
      console.log("Posición enviada con éxito. Estado:", response.status);
      console.log(xmlData);
    })
    .catch((error) => {
      console.error("Error al enviar la posición:", error);
    });
}

function sendPositions(data) {
  data.data.forEach(sendPosition);
}

function sendMondelez(data) {
  function formatDate(date) {
    return moment(date.gpsTime).format("DDMMYYHHmmss").padStart(12, "0");
  }

  data.data.forEach((position) => {
    const velocidad = position.speed.toString().padStart(3, "0");
    const curso = position.course.toString().padStart(3, "0");
    const mensaje = `${position.licenseNumber}${position.lat}${position.lng}${formatDate(position)}${velocidad}${curso}3A`;

    const clienteUDP = dgram.createSocket("udp4");

    const bufferMensaje = Buffer.from(mensaje);
    clienteUDP.send(
      bufferMensaje,
      puertoMdlz,
      ipMdlz,
      (error) => {
        if (error) {
          console.error("Error al enviar mensaje por UDP:", error);
        } else {
          console.log("Mensaje enviado con éxito por UDP: ", mensaje);
        }
        clienteUDP.close();
      }
    );
  });
}

function consultaPosiciones() {
  const dirConsulta = `${apiUrl}/device/status?accessToken=${accessToken}&imei=${imei}&account=${account}`;
  axios
    .get(dirConsulta)
    .then((response) => {
      const positionsData = response.data;
      sendPositions(positionsData);
      sendMondelez(positionsData);
    })
    .catch((error) => {
      console.error("Error en la solicitud de estado del dispositivo:", error);
    });
}

function main() {
  obtenerTokenWanWay();
  obtenerTokenRecursoSeguro();
  setInterval(obtenerTokenWanWay, 7200000);
  setInterval(consultaPosiciones, 10000);
}

main();
