from PIL import Image
import pytesseract
import sys

# (À commenter ou supprimer sur Render, car tesseract sera déjà installé via apt)
# pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

def lire_texte_image(chemin_image):
    try:
        image = Image.open(chemin_image)
        texte = pytesseract.image_to_string(image, lang='eng')  # ou 'fra' si tu veux
        return texte
    except Exception as e:
        return f"Erreur lors de la lecture de l'image : {e}"

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Veuillez fournir le chemin de l'image en argument.")
    else:
        chemin = sys.argv[1]
        resultat = lire_texte_image(chemin)
        print(resultat)
