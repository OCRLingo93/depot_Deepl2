const express = require("express");
const axios = require("axios");
const fs = require("fs");
const { exec } = require("child_process");
const translate = require("@vitalets/google-translate-api");  // <- importer la traduction
const app = express();
const PORT = process.env.PORT || 3000;

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = "Mon_Token"; // même token que tu mets dans Meta

app.use(express.json());

// Route GET pour la validation du webhook par Meta
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

// Route POST pour recevoir les messages WhatsApp
app.post("/webhook", async (req, res) => {
  const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

  if (message && message.type === "image") {
    const from = message.from;
    const mediaId = message.image.id;

    try {
      // 1. Récupère l'URL de téléchargement de l'image
      const mediaResponse = await axios.get(
        `https://graph.facebook.com/v18.0/${mediaId}`,
        {
          headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
        }
      );

      const mediaUrl = mediaResponse.data.url;

      // 2. Télécharge l'image et la sauvegarde localement
      const imagePath = "./temp/image.jpg";
      const imageDownload = await axios.get(mediaUrl, {
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
        responseType: "stream",
      });

      const writer = fs.createWriteStream(imagePath);
      imageDownload.data.pipe(writer);

      writer.on("finish", () => {
        // 3. Appelle le script OCR
        exec(`python3 ocr.py ${imagePath}`, async (error, stdout, stderr) => {
          if (error || stderr) {
            console.error("Erreur OCR :", error || stderr);
            return;
          }

          const texteOCR = stdout.trim();
          console.log("Texte OCR extrait:", texteOCR);

          // 4. Traduire le texte OCR en français (ou autre langue)
          try {
            const resTranslate = await translate(texteOCR, { to: "fr" });
            const texteTraduit = resTranslate.text;
            console.log("Texte traduit:", texteTraduit);

            // 5. Envoie le texte traduit via WhatsApp
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
          } catch (translateError) {
            console.error("Erreur traduction :", translateError);
          }
        });
      });
    } catch (e) {
      console.error("❌ Erreur générale :", e.message);
    }

    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});
