FROM node:latest

# Create the directory
RUN mkdir -p /usr/src/bot
WORKDIR /usr/src/bot

# Install dependencies
COPY package.json /usr/src/bot
RUN npm install

# Copy rest of the files
COPY . /usr/src/bot

# Start the bot
CMD ["node", "index.js"]