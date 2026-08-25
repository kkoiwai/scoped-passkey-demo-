FROM public.ecr.aws/lambda/nodejs:20

# Install Chromium dependencies for headless browser automation
RUN dnf install -y \
    alsa-lib \
    atk \
    cups-libs \
    gtk3 \
    libXcomposite \
    libXcursor \
    libXdamage \
    libXext \
    libXi \
    libXrandr \
    libXScrnSaver \
    libXtst \
    pango \
    xorg-x11-fonts-100dpi \
    xorg-x11-fonts-75dpi \
    xorg-x11-fonts-Type1 \
    xorg-x11-fonts-misc \
    nss \
    mesa-libgbm \
    && dnf clean all

WORKDIR ${LAMBDA_TASK_ROOT}
ENV HOME=/tmp

COPY package*.json ./
RUN npm install --omit=dev
RUN npx @puppeteer/browsers install chrome@126.0.6478.182

COPY dist/ ./dist/

CMD [ "dist/src/lambda/web-app-handler.handler" ]
