var http = require("http"),
    io = require('socket.io'),
    url = require('url'),
    static = require('node-static'),
    _ = require('underscore');

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

var ChatRoom = (function () {
  
  var ChatRoom = function (name) {
    this.clients = {};
    this.name = name;
  }
  ChatRoom.prototype = new Object();
  
  ChatRoom.prototype.join = function (client) {
    if (this.clients[client.id] === undefined) {
      this.clients[client.id] = client;
      this.broadcast("userjoin", client);
      client.socket.send(JSON.stringify({
        type: "userlist",
        payload: _(this.clients).map(function (client) { return client.idObj(); })
      }));
    }
  }
  
  ChatRoom.prototype.leave = function (client) {
    if (this.clients[client.id] !== undefined) {
      delete this.clients[client.id];
      this.broadcast("userleave", client);
    }
  }
  
  ChatRoom.prototype.broadcast = function (message, from, payload) {
    var data = {type: message, from: from.idObj()};
    if (payload !== undefined) {
      data.payload = payload;
    }
    data = JSON.stringify(data);
    
    _(this.clients).chain()
      .select(function (client) { return client.id !== from.id })
      .each(function (client) { client.socket.send(data); });
  }
  
  ChatRoom.prototype.sendMessage = function (message, from) {
    this.broadcast("usermessage", from, message);
  }
  
  ChatRoom.prototype.hasClient = function (client) {
    return (this.clients[client.id] !== undefined);
  }
  
  return ChatRoom;
  
}());


var GameClient = (function () {

  var GameClient = function (socket, lobby, index) {
    this.socket = socket;
    this.id = socket.sessionId;
    this.name = "Anon User";
    this.opponent = undefined;
    this.lobby = lobby;
    this.index = index;
    
    this.index[this.id] = this;
    
    socket.send(JSON.stringify({
      type: "myid",
      payload: this.id
    }));
    
    socket.on('message', _.bind(function (data) {
      var message = JSON.parse(data);
      if (message.type && (typeof this[message.type] === "function")) {
        this[message.type](message, data);
      }
    }, this));
    
    socket.on('disconnect', _.bind(function () {
      this.disconnect();
    }, this));
  }
  GameClient.prototype = new Object();
  
  GameClient.prototype.socketSend = function (type, payload) {
    var data = {type: type};
    if (payload !== undefined) {
      data.payload = payload;
    }
    this.socket.send(JSON.stringify(data));
  }
  
  GameClient.prototype.setName = function (message) {
    this.name = htmlEscape(message.payload);
  }
  
  GameClient.prototype.idObj = function () {
    return {id: this.id, name: this.name};
  }
  
  GameClient.prototype.joinChat = function () {
    this.lobby.join(this);
  }
  
  GameClient.prototype.leaveChat = function () {
    this.lobby.leave(this);
  }
  
  GameClient.prototype.sendChat = function (message) {
    this.lobby.sendMessage(htmlEscape(message.payload), this);
  }
  
  GameClient.prototype.disconnect = function () {
    this.leaveChat();
    this.gameleave();
    delete this.index[this.id];
  }
  
  GameClient.prototype.sendChallenge = function (message) {
    if (clientIndex[message.payload.id] !== undefined) {
      clientIndex[message.payload.id].socketSend("sendChallenge", this.idObj());
    }
  }
  
  GameClient.prototype.cancelChallenge = function (message) {
    if (clientIndex[message.payload.id] !== undefined) {
      clientIndex[message.payload.id].socketSend("cancelChallenge", this.idObj());
    }
  }
  
  GameClient.prototype.denyChallenge = function (message) {
    if (clientIndex[message.payload.id] !== undefined) {
      clientIndex[message.payload.id].socketSend("denyChallenge", this.idObj());
    }
  }
  
  GameClient.prototype.acceptChallenge = function (message) {
    this.opponent = clientIndex[message.payload.id];
    this.opponent.opponent = this;
    this.opponent.socketSend("acceptChallenge", this.idObj());
  }
  
  GameClient.prototype.gamemove = function (message, data) {
    if (this.opponent) {
      this.opponent.socketSend("gamemove", message.payload);
    }
  };
  
  GameClient.prototype.gamemessage = function (message) {
    if (this.opponent) {
      this.opponent.socketSend("gamemessage", htmlEscape(message.payload));
    }
  };
  
  GameClient.prototype.gameleave = function () {
    if (this.opponent) {
      this.opponent.socketSend("gameleave");
      this.opponent.game = undefined;
    }
    this.game = undefined;
  };
  
  return GameClient;

}());

// socket.io 
var socket = io.listen(server);
var clientIndex = {}
var gameLobby = new ChatRoom("lobby");

socket.on('connection', function(client) {
  new GameClient(client, gameLobby, clientIndex);
});