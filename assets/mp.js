var MessageRouter = (function () {
  
  var routes = {};
  var socket;
  
  var MessageRouter = function (server) {
    socket = new io.Socket(server);
    socket.connect();
    
    socket.on('message', function (data) {
      var message = JSON.parse(data);
      if (message.type in routes) {
        routes[message.type](message.payload, message.from);
      }
    });
  }
  MessageRouter.prototype.route = function (message, callback) {
    routes[message] = callback;
  }
  MessageRouter.prototype.on = function (event, callback) {
    socket.on(event, callback);
  }
  MessageRouter.prototype.send = function (message, payload) {
    socket.send(JSON.stringify({
      type: message,
      payload: payload
    }));
  }
  
  return MessageRouter;
  
}());

var PageControl = (function () {
  
  var PageControl = function () {
    this.defaultpage = arguments[0];
    this.pages = {};
    for (var i = 0, len = arguments.length; i < len; i++) {
      this.pages[arguments[i]] = $(arguments[i]).hide();
    }
    
    this.pages[this.defaultpage].show();
    this.currentpage = this.defaultpage;
  }
  PageControl.prototype.show = function (id) {
    this.pages[this.currentpage].hide();
    this.pages[id].show();
    this.currentpage = id;
  }
  
  return PageControl;
  
}());

$(document).ready(function () {
  
  var myname = store.get("username");
  var myid = null;
  var users = [];
  var challenges = {};
  var board;
  var gamestate;
  
  var pages = new PageControl("#login", "#chatroom", "#gameroom");
  var socket = new MessageRouter("go.five-sixty.co.uk");
  
  socket.on("connect", function () {
    if (myname !== undefined) {
      setUsername(myname);
      joinChat();
    }
  });
  
  socket.route("userlist", function (payload) {
    users = payload;
    displayUsers();
  })
  
  socket.route("usermessage", function (payload, from) {
    displayMessage(from, payload);
  })
  
  socket.route("myid", function (payload) {
    myid = payload;
    displayUsers();
  });
  
  socket.route("sendChallenge", function (payload) {
    addChallenge(payload, "received");
  });
  
  socket.route("denyChallenge", function (payload) {
    removeChallenge(payload);
    systemMessage(payload.name + " denied your challenge.");
  });
  
  socket.route("acceptChallenge", function (payload) {
    startGame("white", payload);
  });
  
  socket.route("cancelChallenge", function (payload) {
    removeChallenge(payload);
  });
  
  socket.route("userjoin", function (payload, from) {
    users.push(from);
    displayUsers();
  });
  
  socket.route("userleave", function (payload, from) {
    users = _.reject(users, function (user) {
      return user.id === from.id;
    });
    displayUsers();
    
    removeChallenge(from);
  });
  
  function displayUsers() {
    $("#users ul").empty();
    users.sort(function (a, b) {
      return (a.name < b.name) ? -1 : ((a.name > b.name) ? 1 : 0);
    });

    _.each(users, function (user) {
      if (user.id === myid) {
        $("#users ul").append($("<li class=\"me\">"+user.name+"</li>").data("user", user));
      } else {
        var element = $("<li>"+user.name+"</li> ");
        element.append($("<a href=\"#\">Challenge</a>").click(function () {
          socket.send("sendChallenge", user);
          addChallenge(user, "sent");
          return false;
        }));
        $("#users ul").append(element);
      }
    });
  }

  function displayMessage(from, message) {
    $("#chat ul").append($("<li>"+ (new Date).format("isoTime") +" <b>" + from.name + "</b>: " + message + "</li>"));
    $("#chat").attr({ scrollTop: $("#chat").attr("scrollHeight") });
  }
  
  function systemMessage(message) {
    displayMessage({name:"System"}, message);
  }

  function displayChallenges() {
    $("#challenges ul").empty();
    _.map(challenges, function (challenge) {
      var element = $("<li>" + challenge.name + " </li>");
      if (challenge.type === "sent") {
        element.append($("<a href=\"#\">Cancel</a>").click(function () {
          socket.send("cancelChallenge", challenge);
          removeChallenge(challenge);
          return false;
        }));
      } else {
        element.append($("<a href=\"#\">Accept</a>").click(function () {
          socket.send("acceptChallenge", challenge);
          startGame("black", challenge);
          removeChallenge(challenge);
          return false;
        }));
        element.append($("<a href=\"#\">Deny</a>").click(function () {
          socket.send("denyChallenge", challenge);
          removeChallenge(challenge);
          return false;
        }));
      }
      $("#challenges ul").append(element);
    });
  }

  function addChallenge(user, state) {
    challenges[user.id] = user;
    challenges[user.id].type = state;
    displayChallenges();
  }
  function removeChallenge(message) {
    if (challenges[message.id]) {
      delete challenges[message.id];
      displayChallenges();
    }
  }
  
  function joinChat() {          
    socket.send("joinChat");
    pages.show("#chatroom");
  }
  
  function leaveChat() {
    socket.send("leaveChat");
  }
  
  function setUsername(name) {
    store.set("username", name);
    myname = name;
    socket.send("setName", name);
  }
  
  socket.route("gamemove", function (payload) {
    if (gamestate !== undefined) {
      gamestate.makeMove(payload.side, payload.x, payload.y);
    }
  });
  
  var opponent;
  
  function startGame(side, other) {
    opponent = other;
    leaveChat();
    pages.show("#gameroom");
    
    board = new HTMLBoard($("#game"), side);
    gamestate = new GameLogic(19, 19, board);
    
    gamestate.madeMove = function (side_, x, y) {
      if (side === side_) {
        socket.send("gamemove", {side:side, x:x, y:y});
      }
    }
  }
  
  function displayGameMessage(from, message) {
    $("#gamechat ul").append($("<li>"+ (new Date).format("isoTime") +" <b>" + from.name + "</b>: " + message + "</li>"));
    $("#gamechat").attr({ scrollTop: $("#gamechat").attr("scrollHeight") });
  }
  
  socket.route("gamemessage", function (payload) {
    displayGameMessage(opponent, payload);
  });
  
  socket.route("gameleave", function () {
    displayGameMessage({name:"System"}, "Your opponent left the game.");
  });
  
  function leaveGame() {
    socket.send("gameleave");
    $("#game").empty();
    $("#gamechat ul").empty();
    board = undefined;
    gamestate = undefined;
    joinChat();
  }
  
  $("#gameleave").click(leaveGame);
  
  $("#loginform").submit(function () {
    setUsername($("#name").val());
    joinChat();
    
    return false;
  });
  
  $("#chatform").submit(function () {
    if ($("#chatbox").val() !== "") {
      displayMessage({name:myname}, $("#chatbox").val());
      socket.send("sendChat", $("#chatbox").val());
      $("#chatbox").val("");
    }
    return false;
  });
  
  $("#gamechatbox form").submit(function () {
    if ($("#gamechatinput").val() !== "") {
      displayGameMessage({name:myname}, $("#gamechatinput").val());
      socket.send("gamemessage", $("#gamechatinput").val());
      $("#gamechatinput").val("");
    }
    return false;
  });
  
  socket.on('disconnect', function() {
    users = [];
    challenges = {};
    displayUsers();
    displayChallenges();
    systemMessage("You got disconnected.");
    if (gamestate !== undefined) {
      displayGameMessage({name:"System"}, "You got disconnected.")
    }
  });
  
});