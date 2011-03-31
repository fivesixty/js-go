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

function broadcastMessage(client, message) {
  for (var clientid in socket.clients) {
    if (socket.clients[clientid].inChat === true) {
      socket.clients[clientid].send(JSON.stringify({type:"chatmessage", payload:{user: client.name, message: message}}));
    }
  }
}

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
  var chatters = getChatters(function (id, client) {
    return {id:id,name:client.name};
  });
  if (payload !== undefined) {
    payload = JSON.stringify({type:message, from: {id:from.sessionId,name:from.name}, payload: payload});
  } else {
    payload = JSON.stringify({type:message, from: {id:from.sessionId,name:from.name}});
  }
  for (var i = 0, len = chatters.length; i < len; i++) {
    if (chatters[i].id !== from.sessionId) {
      socket.clients[chatters[i].id].send(payload);
    }
  }
}

function sendChallenge(target, sender) {
  target.send(JSON.stringify({
    type:"sendChallenge",
    payload: {id:sender.sessionId, name:sender.name}
  }));
}

function denyChallenge(target, sender) {
  target.send(JSON.stringify({
    type:"denyChallenge",
    payload: {id:sender.sessionId, name:sender.name}
  }));
}

function cancelChallenge(target, sender) {
  target.send(JSON.stringify({
    type:"cancelChallenge",
    payload: {id:sender.sessionId, name:sender.name}
  }));
}

function acceptChallenge(target, sender) {
  var game = {black: sender, white: target};
  sender.game = game;
  target.game = game;
  
  target.send(JSON.stringify({
    type:"acceptChallenge",
    payload: {id:sender.sessionId, name:sender.name}
  }));
}

socket.on('connection', function(client){ 
  
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
        sendChallenge(socket.clients[message.payload.id], client);
        break;
      case "cancelChallenge":
        cancelChallenge(socket.clients[message.payload.id], client);
        break;
      case "denyChallenge":
        denyChallenge(socket.clients[message.payload.id], client);
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