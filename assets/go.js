var CELL_SIZE = 25;

var HTMLBoard = (function () {
  
  var renderer = function (gamediv) {
    this.gamediv = gamediv;
    this.board = $("<div id=\"board\"></div>");
    this.gamediv.append(this.board);
    this.statuspanel = $("<div id=\"status\"></div>");
    this.gamediv.append(this.statuspanel);
  };
  
  renderer.prototype.init = function (w, h, state) {
    this.width = w;
    this.height = h;
    this.board.empty();
    
    this.state = state;
    
    this.board.css("width", this.width * CELL_SIZE);
    
    this.cells = [];
    
    // Generate board cells
    for (var y = 0; y < this.height; ++y) {
      this.cells[y] = [];
      for (var x = 0; x < this.width; ++x) {
        this.cells[y][x] = generateCell(x, y, w, h);
        this.board.append(this.cells[y][x]);
      }
    }
    this.board.append($('<div style="clear: both">'));
    this.statuspanel.html(this.genStatus());
    
    var $this = this;
    $(".square", this.gamediv).live('click', function () {
      var t = $(this);
      $this.cellClicked($this.state.getPlayerTurn(), t.data('x'), t.data('y'));
    });
  };
  
  renderer.prototype.genStatus = function () {
    return "Turn: " + this.state.turn + " (" + this.state.getPlayerTurn() + ").";
  }
  
  renderer.prototype.cellClicked = function (x, y) {
    console.log("Implement board.cellClicked", x, y);
  }
  
  // Cell iterator helper
  renderer.prototype.eachCell = function (callback) {
    for (var x = 0; x < this.height; ++x) {
      for (var y = 0; y < this.width; ++y) {
        callback(x, y);
      }
    }
  }
  
  renderer.prototype.redraw = function () {
    var $this = this, state = this.state;
    $.each(state.getDirty(), function (i, coord) {
      var x = coord[0], y = coord[1];
      switch (state.getCell(x, y)) {
        case "empty":
          $this.setEmpty(x, y);
          break;
        case "white":
          $this.setWhite(x, y);
          break;
        case "black":
          $this.setBlack(x, y);
          break;
      }
    });
    state.clearDirty();
    this.statuspanel.html(this.genStatus());
  }
  
  renderer.prototype.setWhite = function (x, y) {
    this.cells[y][x].toggleClass("black", false)
                    .toggleClass("white", true);
  }
  
  renderer.prototype.setBlack = function (x, y) {
    this.cells[y][x].toggleClass("white", false)
                    .toggleClass("black", true);
  }
  
  renderer.prototype.setEmpty = function (x, y) {
    this.cells[y][x].toggleClass("white", false)
                    .toggleClass("black", false);
  }
  
  // Blips for a normal size 19 board.
  var blipLocs = {'3':true,'9':true,'15':true};
  function generateCell(x, y, w, h) {
    var xclass = "";
    if (x === w-1) {
      xclass += " lastcol";
    }
    if (y === h-1) {
      xclass += " lastrow"
    }
    return $('<div class="square col' + x + ' row' + y + xclass + '">' +
             ((x in blipLocs && y in blipLocs)
               ? '  <div class="blip"></div>' : '') +
             '  <div class="piece"></div>' +
             '  <div class="top left"></div>' +
             '  <div class="top right"></div>' +
             '  <div class="bottom left"></div>' +
             '  <div class="bottom right"></div>' +
             '</div>').data({x: x, y: y});
  }
  
  return renderer;
  
}());

var BoardState = (function () {
  
  var BoardState = function (w, h) {
    var state = [], dirty = [], player = "black";
    this.width = w;
    this.height = h;
    this.turn = 1;
    this.whiteCaptured = 0;
    this.blackCaptured = 0;
    
    // Initialise board state
    for (var x = 0; x < this.width; ++x) {
      state[x] = [];
      for (var y = 0; y < this.height; ++y) {
        state[x][y] = "e";
      }
    }
    
    this.getPlayerTurn = function () {
      return player;
    }
    
    this.getCell = function (x, y) {
      if (state[x][y] === "e") {
        return "empty";
      } else if (state[x][y] === "w") {
        return "white";
      } else {
        return "black";
      }
    }
    this.makeMove = function (x, y) {
      if (state[x][y] === "e") {
        if (player === "white") {
          this.setWhite(x, y);
          player = "black";
          this.turn++;
        } else {
          this.setBlack(x, y);
          player = "white";
        }
        dirty.push([x, y]);
      }
    }
    this.setWhite = function (x, y) {
      state[x][y] = "w";
      dirty.push([x, y]);
    }
    this.setBlack = function (x, y) {
      state[x][y] = "b";
      dirty.push([x, y]);
    }
    this.setEmpty = function (x, y) {
      if (state[x][y] === "b") {
        this.blackCaptured++;
      } else if (state[x][y] === "w") {
        this.whiteCaptured++;
      }
      state[x][y] = "e";
      
      dirty.push([x, y]);
    }
    this.getDirty = function () {
      return dirty.slice(0);
    }
    this.clearDirty = function () {
      dirty = [];
    }
  };
  
  return BoardState;
}());

var GameLogic = (function () {
  
  var logic = function (w, h, renderer) {
    this.width = w;
    this.height = h;
    
    this.state = new BoardState(w, h);
    
    this.renderer = renderer;
    this.renderer.init(w, h, this.state);
    
    this.renderer.cellClicked = $.proxy(this.makeMove, this);
  }
  
  // Play a move at the given location.
  logic.prototype.makeMove = function (player, x, y) {
    if (this.state.getPlayerTurn() === player &&
        this.state.getCell(x, y) === "empty") {
      this.state.makeMove(x, y);
      this.checkGroup(x, y, true);
      this.renderer.redraw();
    }
  }
  
  // Set a group of locations to empty.
  logic.prototype.removeGroup = function (members) {
    var state = this.state;
    $.each(members, function (i, coord) {
      state.setEmpty(coord[0], coord[1]);
    });
  }
  
  // This function checks groups from a given location for their liberties
  // and removes a group if it has 0 liberties. The checkNeighbours flag
  // determines whether to first check neighbouring squares for opposing
  // groups to remove first.
  logic.prototype.checkGroup = function (x, y, checkNeighbours) {
    var checked = [], state = this.state, finding = state.getCell(x, y),
      liberties = 0, queue = [], members = [], $this = this;
    
    for (var i = 0; i < state.width; ++i) {
      checked[i] = [];
      for (var j = 0; j < state.height; ++j) {
        checked[i][j] = false;
      }
    }
    
    // Set the starting point.
    checked[x][y] = true;
    members.push([x, y]);
    queue.push([x, y]);
    
    // If checkNeighbours flag is set, then check neighbours to see if
    // they are of the opposing colour, and if so, check their groups
    // for zero liberties before we check ourselves.
    if (checkNeighbours) {
      var neighbours = [];
      if (x > 0) neighbours.push([x-1,y]);
      if (x < state.width-1) neighbours.push([x+1,y]);
      if (y > 0) neighbours.push([x,y-1]);
      if (y < state.height-1) neighbours.push([x,y+1]);
    
      $.each(neighbours, function (i, neighbour) {
        var s = state.getCell(neighbour[0], neighbour[1]);
        if (s !== "empty" && s !== finding) {
          $this.checkGroup(neighbour[0], neighbour[1], false);
        }
      });
    }
    
    // Go through the queue of locations to inspect.
    while (queue.length > 0) {
      var coord = queue.pop();
      var nx = coord[0], ny = coord[1], s;
      
      // Look at adjacent locations.
      $.each([[nx-1, ny], [nx+1, ny], [nx, ny-1], [nx, ny+1]],
        function (i, coord) {
        var nnx = coord[0], nny = coord[1]
        
        // Make sure we're within bounds, and not double checking.
        if (nnx >= 0 && nnx < state.width &&
            nny >= 0 && nny < state.height &&
            checked[nnx][nny] === false) {
          s = state.getCell(nnx, nny);
          checked[nnx][nny] = true;
          
          // If we find the same colour, then it's part of our group.
          // Add the location to our group members and queue.
          if (s === finding) {
            members.push([nnx, nny]);
            queue.push([nnx,nny]);
          } else if (s === "empty") {
            // Otherwise empty locations give us liberties.
            liberties += 1;
          }
        }
      });
    }
    
    // If our group has no liberties, remove it from the board.
    if (liberties === 0) {
      $this.removeGroup(members);
    }
  }
  
  return logic;
  
}());