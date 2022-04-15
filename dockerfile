FROM node:latest

# Create the directory
RUN mkdir -p /usr/src/bot
WORKDIR /usr/src/bot

# install dependencies
COPY package.json /usr/src/bot
RUN npm install

# copy rest of the files
COPY . /usr/src/bot

# Start the bot
CMD ["node", "index.js"]