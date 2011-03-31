var http = require("http"),
    io = require('socket.io'),
    url = require('url'),
    static = require('node-static');

var fileServer = new static.Server("./assets", { cache: false });

var server = http.createServer(function (request, response) {
  if (url.parse(request.url).pathname === "/") {
    fileServer.serveFile("mp.html", 200, {}, request, response);
  } else {
    request.addListener('end', function () {
      fileServer.serve(request, response);
    });
  }
});
server.listen(8088);

function htmlEscape(text) {
   return text.replace(/&/g,'&amp;').
     replace(/</g,'&lt;');
}

// socket.io 
var socket = io.listen(server);

function getChatters(callback) {
  var chatters = [];
  for (var clientid in socket.clients) {
    if (socket.clients[clientid].inChat === true) {
      chatters.push(callback(clientid, socket.clients[clientid]));
    }
  }
  return chatters;
}

function broadcastToChatters(message, from, payload) {
  var data;
  if (payload !== undefined) {
    data = JSON.stringify({type:message, from: {id:from.sessionId,name:from.name}, payload: payload});
  } else {
    data = JSON.stringify({type:message, from: {id:from.sessionId,name:from.name}});
  }
  for (var clientid in socket.clients) {
    if (socket.clients[clientid].inChat === true && socket.clients[clientid].sessionId !== from.sessionId) {
      socket.clients[clientid].send(data);
    }
  }
}

function challengeMessage(target, sender, type) {
  target.send(JSON.stringify({
    type: type,
    payload: {id:sender.sessionId, name:sender.name}
  }));
}

function acceptChallenge(target, sender) {
  var game = {black: sender, white: target};
  sender.game = game;
  target.game = game;
  
  challengeMessage(target, sender, "acceptChallenge");
}

socket.on('connection', function(client) { 
  
  client.inChat = false;
  
  client.send(JSON.stringify({
    type: "myid",
    payload: client.sessionId
  }));
  
  client.on('message', function(data) {
    var message = JSON.parse(data);
    
    switch(message.type) {
      case "setName":
        client.name = htmlEscape(message.payload);
        break;
      case "joinChat":
        client.inChat = true;
        broadcastToChatters("userjoin", client);
        client.send(JSON.stringify({
          type: "userlist",
          payload: getChatters(function (id, client) {
            return {id:id,name:client.name};
          })
        }));
        break;
      case "leaveChat":
        client.inChat = false;
        broadcastToChatters("userleave", client);
        break;
      case "sendChat":
        broadcastToChatters("usermessage", client, htmlEscape(message.payload));
        break;
        
      case "sendChallenge":
        challengeMessage(socket.clients[message.payload.id], client, "sendChallenge");
        break;
      case "cancelChallenge":
        challengeMessage(socket.clients[message.payload.id], client, "cancelChallenge");
        break;
      case "denyChallenge":
        challengeMessage(socket.clients[message.payload.id], client, "denyChallenge");
        break;
      case "acceptChallenge":
        acceptChallenge(socket.clients[message.payload.id], client);
        break;
      case "gamemove":
        if (message.payload.side === "white") {
          client.game.black.send(data);
        } else {
          client.game.white.send(data);
        }
        break;
      case "gamemessage":
        if (client.game.black.sessionId === client.sessionId) {
          client.game.white.send(data);
        } else {
          client.game.black.send(data);
        }
        break;
      case "gameleave":
        if (client.game) {
          if (client.game.black.sessionId === client.sessionId) {
            client.game.white.send(data);
            client.game.white.game = undefined;
          } else {
            client.game.black.send(data);
            client.game.black.game = undefined;
          }
          client.game = undefined;
        }
        break;
    }
    
  }); 
  client.on('disconnect', function(){
    client.inChat = false;
    if (client.game) {
      if (client.game.white.sessionId === client.sessionId) {
        client.game.black.send(JSON.stringify({type:"gameleave"}));
        client.game.black.game = undefined;
      } else {
        client.game.white.send(JSON.stringify({type:"gameleave"}));
        client.game.white.game = undefined;
      }
    }
    broadcastToChatters("userleave", client);
  });
});