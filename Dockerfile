FROM node:18

# Installer tesseract, python, venv et pip
RUN apt-get update && \
    apt-get install -y tesseract-ocr python3 python3-pip python3-venv

# Définir le répertoire de travail
WORKDIR /app

# Copier les fichiers dans le conteneur
COPY . .

# Créer et activer un environnement virtuel Python, puis installer les dépendances
RUN python3 -m venv /opt/venv && \
    . /opt/venv/bin/activate && \
    /opt/venv/bin/pip install --upgrade pip && \
    /opt/venv/bin/pip install -r requirements.txt

# Ajouter le venv dans le PATH
ENV PATH="/opt/venv/bin:$PATH"

# Installer les dépendances Node.js
RUN npm install

# Lancer l'application
CMD ["npm", "start"]

