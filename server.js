const express = require("express");
const axios = require("axios");
const fs = require("fs");
const { exec } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);

const app = express();
const PORT = process.env.PORT || 3000;

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const DEEPL_API_KEY = process.env.DEEPL_API_KEY; // 🔑 Clé API DeepL
const VERIFY_TOKEN = "Mon_Token";

app.use(express.json());

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook vérifié !");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

// Attendre la fin d'écriture d'un fichier
function waitForStreamFinish(stream) {
  return new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

app.post("/webhook", async (req, res) => {
  const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

  if (message && message.type === "image") {
    const from = message.from;
    const mediaId = message.image.id;

    try {
      // Obtenir l'URL de l'image
      const mediaResponse = await axios.get(
        `https://graph.facebook.com/v18.0/${mediaId}`,
        {
          headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
        }
      );

      const mediaUrl = mediaResponse.data.url;

      // Télécharger l'image
      const imagePath = "./temp/image.jpg";
      const imageDownload = await axios.get(mediaUrl, {
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
        responseType: "stream",
      });

      const writer = fs.createWriteStream(imagePath);
      imageDownload.data.pipe(writer);
      await waitForStreamFinish(writer);

      // OCR via script Python
      const { stdout, stderr } = await execPromise(`python3 ocr.py ${imagePath}`);

      if (stderr) {
        console.error("Erreur OCR :", stderr);
        return res.sendStatus(500);
      }

      const texteOCR = stdout.trim();
      console.log("Texte OCR extrait:", texteOCR);

      if (!texteOCR) {
        await axios.post(
          `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
          {
            messaging_product: "whatsapp",
            to: from,
            text: { body: "Désolé, aucun texte n'a été détecté dans l'image." },
          },
          {
            headers: {
              Authorization: `Bearer ${ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
          }
        );
        return res.sendStatus(200);
      }

      // Traduction via DeepL
      const deeplRes = await axios.post("https://api-free.deepl.com/v2/translate", null, {
        params: {
          auth_key: DEEPL_API_KEY,
          text: texteOCR,
          target_lang: "FR",
        },
      });

      const texteTraduit = deeplRes.data.translations[0].text;
      console.log("Texte traduit:", texteTraduit);

      // Envoyer le message traduit via WhatsApp
      await axios.post(
        `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to: from,
          text: { body: texteTraduit },
        },
        {
          headers: {
            Authorization: `Bearer ${ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );

      console.log("✅ Message traduit envoyé à l'utilisateur");
      res.sendStatus(200);
    } catch (err) {
      console.error("Erreur OCR ou traduction :", err.response?.data || err.message);
      res.sendStatus(500);
    } finally {
      // Supprimer l'image temporaire
      if (fs.existsSync("./temp/image.jpg")) {
        fs.unlink("./temp/image.jpg", (err) => {
          if (err) console.error("Erreur suppression image :", err.message);
        });
      }
    }
  } else {
    res.sendStatus(404);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});
