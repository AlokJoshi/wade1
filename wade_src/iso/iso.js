/**
 * This is an isometric plug-in for the Wade Game Engine by Clockwork Chilli.
 * @version 3.0
 * @constructor
 */
 
Wade_iso = function()
{
    var self = this;
    var tileScaleFactor = 1.018;
    var terrainLayerId = 30;
    var objectsLayerId = 25;
    var loadingState = {};
    var movingObjects = [];
    var initialized, terrain, terrainBehavior, map, movementDirection, movementOffsets;

    var initialize = function()
    {
        if (!initialized)
        {
            self.init();
        }
    };

    /**
     * Initialize the isometric engine. This is typically done automatically and in normal circumstances you don't need to call this function from your code.
     * @param {object} [params] An object with some of the following fields (they are all optional), describing the properties of the isometric world:<br/>
     * <ul>
     *     <li><b>tileScaleFactor</b>: A scale factor for all terrain tiles, to compensate for floating-point precision and rounding errors. Default is 1.018 (meaning that tiles are 1.8% bigger than what they should theoretically be)</li>
     *     <li><b>terrainLayerId</b>: The layer id to use for the terrain. Default is 30</li>
     *     <li><b>objectsLayerId</b>: The layer id to use for isometric objects. Default is 25</li>
     *     <li><b>dontClearCanvas</b>: Set this to true as an optimization to avoid clearing the terrain canvas every frame (you can do this when the camera is constrained to the terrain, i.e when the terrain occupies the whole screen at all times). Default is false.</li>
     *     <li><b>tileSize</b>: The size (in world units) of each tile. This is an object with x and y fields, default is {x: 512, y: 256}</li>
     *     <li><b>numTiles</b>: An object with x and z fields describing the number of tiles in the isometric world. Default is {x: 1, z: 1}</li>
     *     <li><b>movementDirection</b>: A string describing the movement direction (used for character animations and pathfinding). It can be 'diagonal', 'straight', or 'both'. Default is 'diagonal'</li>
     *     <li><b>map</b>: A string pointing to a JSON file that contains a map to load</li>
     *     <li><b>callback</b>: If a map has been specified, this is the function to call when the map has been fully loaded</li>
     * </ul>
     */
    this.init = function(params)
    {
        initialized = true;
        params = params || {};
        (typeof(params.tileScaleFactor) == 'number') && (tileScaleFactor = params.tileScaleFactor);
        (typeof(params.terrainLayerId) == 'number') && (terrainLayerId = params.terrainLayerId);
        (typeof(params.objectsLayerId) == 'number') && (objectsLayerId = params.objectsLayerId);

        // create a terrain and add it to the scene if there is one tile or more
        params.dontClearCanvas && wade.setCanvasClearing(terrainLayerId, false);
        wade.setLayerSorting(objectsLayerId, 'bottomToTop');
        terrain = new SceneObject(0, TerrainBehavior, 0, 0, 'iso_terrain');
        terrain.iso = {};
        terrainBehavior = terrain.getBehavior();
        (typeof(params.tileSize) == 'object') && (terrainBehavior.c_tileSize = wade.cloneObject(params.tileSize));
        if (typeof(params.numTiles) == 'object')
        {
            var numTilesX = params.numTiles.x;
            var numTilesZ = params.numTiles.z;
        }
        numTilesX = numTilesX || 0;
        numTilesZ = numTilesZ || 0;
        if (numTilesX && numTilesZ)
        {
            wade.addSceneObject(terrain, false);
        }

        // initialise arrays to store game objects and collision information
        this.gameObjects = [];
        this.gridObjects = [];
        this.collisionMap = [];
        movingObjects = [];

        // set up valid movement offsets
        movementDirection = params.movementDirection || 'diagonal';
        movementOffsets = getMovementOffsets(movementDirection);

        // create a default tile texture
        var back = new Sprite(0, terrainLayerId);
        back.setSize(terrainBehavior.c_tileSize.x, terrainBehavior.c_tileSize.x);
        back.setDrawFunction(wade.drawFunctions.solidFill_('white'));
        back.setRotation(Math.PI / 4);
        var grid = new Sprite(0, terrainLayerId);
        grid.setSize(terrainBehavior.c_tileSize.x, terrainBehavior.c_tileSize.x);
        grid.setDrawFunction(wade.drawFunctions.grid_(1, 1, 'black', 2));
        grid.setRotation(Math.PI / 4);
        var transparent = new Sprite(0, terrainLayerId);
        transparent.setDrawFunction(function() {});
        var size = Math.ceil(terrainBehavior.c_tileSize.x * Math.sqrt(2));
        transparent.setSize(size, size);
        transparent.drawToImage('_wade_isoDefault', true);
        back.drawToImage('_wade_isoDefault', false, null, null, '', '2d');
        var tileSprite = new Sprite('_wade_isoDefault', terrainLayerId);
        tileSprite.setSize(terrainBehavior.c_tileSize.x, terrainBehavior.c_tileSize.y);
        tileSprite.drawToImage('_wade_isoDefault', true, null, null, '', '2d');
        transparent.drawToImage('_wade_isoGrid', true, null, null, '', '2d');
        grid.drawToImage('_wade_isoGrid', false, null, null, '', '2d');
        tileSprite = new Sprite('_wade_isoGrid', terrainLayerId);
        tileSprite.setSize(terrainBehavior.c_tileSize.x, terrainBehavior.c_tileSize.y);
        tileSprite.drawToImage('_wade_isoGrid', true, null, null, '', '2d');

        // if we have a map, load terrain and game objects
        if (params.map)
        {
            loadingState = {};
            if (typeof(params.map) == 'string')
            {
                wade.loadJson(params.map, null, function(data)
                {
                    map = {data: data};
                    terrainBehavior.loadData_begin(map.data, finishedLoading_('terrain', params.callback));
                    loadObjects(map.data, params.callback);
                });
            }
            else
            {
                map = params.map;
                terrainBehavior.loadData_begin(map.data, finishedLoading_('terrain', params.callback));
                loadObjects(map.data, params.callback);
            }
        }
        else
        {
            // no map, let's fill the terrain with our default texture
            terrainBehavior.setNumTiles(numTilesX, numTilesZ);
        }

        // start a main loop to monitor moving objects and update their iso grid coordinates
        wade.setMainLoop(function()
        {
            for (var i=movingObjects.length-1; i>=0; i--)
            {
                var obj = movingObjects[i];
                var pos = obj.getPosition();
                var gridCoords = terrainBehavior.getFlatTileCoordinates(pos.x, pos.y);

                // if we're near a point where 4 tiles intersect and we can move straight, use a little tolerance to account for floating-point precision errors (objects may appear to be in the wrong tile for one frame)
                var tileCenter = terrainBehavior.getFlatWorldCoordinates(gridCoords.x, gridCoords.z);
                var dx = pos.x - tileCenter.x;
                var dy = pos.y - tileCenter.y;
                var hx = terrainBehavior.c_tileSize.x / 2;
                var hy = terrainBehavior.c_tileSize.y / 2;
                var epsilon = wade.c_epsilon;
                if ((movementDirection == 'both' || movementDirection == 'straight') && (Math.abs(dx) < epsilon && dy*dy >= hy*hy - epsilon) || (Math.abs(dy) < epsilon && dx*dx >= hx*hx - epsilon))
                {
                    continue;
                }

                // can we go to the next tile?
                if (updateObjectTile(obj, gridCoords.x, gridCoords.z))
                {
                    obj.iso.previousPosition.x = pos.x;
                    obj.iso.previousPosition.y = pos.y;
                }
                else
                {
                    obj.setPosition(obj.iso.previousPosition);
                    obj.processEvent('onStuck', {});
                }

                // have we reached our target coordinates yet?
                if (obj.iso.targetCoords && (obj.iso.targetCoords.x == gridCoords.x) && (obj.iso.targetCoords.z == gridCoords.z))
                {
                    obj.iso.targetCoords = 0;
                    wade.removeObjectFromArray(obj, movingObjects);
                }
            }
        }, '_wade_isoMovingObjects');

        if (!params.map && params.callback)
        {
            params.callback();
        }
    };

    /**
     * Import isometric objects (including terrain) from a data object
     * @param {Object} data The isometric scene data object
     * @param {function} [callback] A function to call when the assets referenced in the data have been fully loaded and added to the scene
     */
    this.importScene = function(data, callback)
    {
        initialize();
        map = {data: data};
        terrainBehavior.loadData_begin(map.data, finishedLoading_('terrain', callback));
        loadObjects(map.data, callback);
    };

    /**
     * Get the size (in world units) of a terrain tile
     * @returns {{x: number, y: number}} An object representing the size of a terrain tile
     */
    this.getTileSize = function()
    {
        initialize();
        return wade.cloneObject(terrainBehavior.c_tileSize);
    };

    /**
     * Get a list of directions that object on the isometric grid are allowed to use (this is used by Characters and for pathfinding). Depending on the 'movementDirection' parameter specified in the <i>init</i> function, this could be an array of 4 or 8 elements.
     * @returns {Array} An array of objects with x and z fields representing the valid movement directions
     */
    this.getValidMovementDirections = function()
    {
        initialize();
        return wade.cloneArray(movementOffsets);
    };


    /**
     * Get the scale factor that is being applied to each terrain tile (often to compensate for floating-point errors).
     * @returns {number} The scale factor
     */
    this.getTileScaleFactor = function()
    {
        initialize();
        return tileScaleFactor;
    };

    /**
     * Set a height offset for a tile. This affects the position in the world for the tile and any isometric object on that tile.
     * @param {number} x The index of the tile on the isometric X axis
     * @param {number} z The index of the tile on the isometric X axis
     * @param {number} [height] A height offset in world units. Positive numbers will cause the tile to appear higher, negarive numbers will make it appear lower than ground level.
     */
    this.setTileHeight = function(x, z, height)
    {
        terrainBehavior.setTileHeight(x, z, height || 0);
    };

    /**
     * Get the height offset of a tile
     * @param {number} x The index of the tile on the isometric X axis
     * @param {number} z The index of the tile on the isometric X axis
     * @returns {number} The current height offset for the specified tile
     */
    this.getTileHeight = function(x, z)
    {
        return terrainBehavior.getTileHeight(x, z);
    };


    /**
     * Get the number of terrain tiles being used
     * @returns {{x: number, z: number}} The current number of tiles
     */
    this.getNumTiles = function()
    {
        return terrainBehavior? {x: terrainBehavior.numTilesX, z: terrainBehavior.numTilesZ} : {x: 0, z: 0};
    };

    /**
     * Get the sprite being used as a terrain tile at the specified tile coordinates
     * @param {number} tileX The index of the tile on the isometric X axis
     * @param {number} tileZ The index of the tile on the isometric Z axis
     * @returns {Sprite} The sprite at the current tile coordinates
     */
    this.getTileSprite = function(tileX, tileZ)
    {
        return terrainBehavior && terrainBehavior.tileSprites[tileX] && terrainBehavior.tileSprites[tileX][tileZ];
    };

    /**
     * Get the data associated with a specific tile
     * @param {number} tileX The index of the tile on the isometric X axis
     * @param {number} tileZ The index of the tile on the isometric Z axis
     * @returns {Object} An object containing any data associated with a specific tile ( such as which image file it's using, if it has animations, and any other data set with setTile() ).
     */
    this.getTileData = function(tileX, tileZ)
    {
        return terrainBehavior && terrainBehavior.getTileData(tileX, tileZ);
    };

    /**
     * Get the sprite being used as a terrain transition at the specified tile coordinates
     * @param {number} tileX The index of the tile on the isometric X axis
     * @param {number} tileZ The index of the tile on the isometric Z axis
     * @returns {Sprite} The sprite at the current tile coordinates
     */
    this.getTransitionSprite = function(tileX, tileZ)
    {
        return terrainBehavior && terrainBehavior.transitionSprites[tileX] && terrainBehavior.transitionSprites[tileX][tileZ];
    };

    /**
     * Get the data associated with a specific terrain transition
     * @param {number} tileX The index of the tile on the isometric X axis
     * @param {number} tileZ The index of the tile on the isometric Z axis
     * @returns {Object} An object containing any data associated with a specific terrain transition ( such as which image file it's using, if it has animations, and any other data set with setTransition() ).
     */
    this.getTransitionData = function(tileX, tileZ)
    {
        return terrainBehavior && terrainBehavior.getTransitionData(tileX, tileZ);
    };

    /**
     * Get the sprite being used as a terrain detail at the specified tile coordinates
     * @param {number} tileX The index of the tile on the isometric X axis
     * @param {number} tileZ The index of the tile on the isometric Z axis
     * @returns {Sprite} The sprite at the current tile coordinates
     */
    this.getDetailSprite = function(tileX, tileZ)
    {
        return terrainBehavior && terrainBehavior.detailSprites[tileX] && terrainBehavior.detailSprites[tileX][tileZ];
    };

    /**
     * Get the data associated with a specific terrain detail
     * @param {number} tileX The index of the tile on the isometric X axis
     * @param {number} tileZ The index of the tile on the isometric Z axis
     * @returns {Object} An object containing any data associated with a specific terrain detail ( such as which image file it's using, if it has animations, and any other data set with setDetail() ).
     */
    this.getDetailData = function(tileX, tileZ)
    {
        return terrainBehavior && terrainBehavior.getDetailData(tileX, tileZ);
    };

    /**
     * Get the layer Id that is being used by terrain sprites
     * @returns {number} The id of the layer used by terrain sprites
     */
    this.getTerrainLayerId = function()
    {
        return terrainLayerId;
    };

    /**
     * Get the isometric terrain object
     * @returns {SceneObject} The isometric terrain object
     */
    this.getTerrain = function()
    {
        initialize();
        return terrain;
    };

    /**
     * Get the layer Id that is being used by isometric objects
     * @returns {number} The id of the layer used by isometric objects
     */
    this.getObjectsLayerId = function()
    {
        return objectsLayerId;
    };

    /**
     * Check to see if there are any objects with collision in a specific tile
     * @param {number} x The isometric X coordinate of the tile
     * @param {number} z The isometric Z coordinate of the tile
     * @returns {boolean} Whether there are any objects with collision in the tile
     */
    this.checkCollisionsAtTile = function(x, z)
    {
        return !!(this.collisionMap && this.collisionMap[x] && this.collisionMap[x][z]);
    };

	/**
	 * Clear the collision flag on a specific cell. If x and z are omitted, clear collisions everywhere on the map
     * @param {number} [x] The isometric X coordinate of the tile
     * @param {number} [z] The isometric Z coordinate of the tile
     */
    this.clearCollisions = function(x, z)
    {
        var numTiles = this.getNumTiles();
        if (typeof(x) == 'undefined')
        {
            for (var i=0; i<numTiles.x; i++)
            {
                for (var j=0; j<numTiles.z; j++)
                {
                    if (this.collisionMap[i])
                    {
                        this.collisionMap[i][j] = null;
                    }
                }
            }
        }
        else if (this.collisionMap[x])
        {
            this.collisionMap[x][z] = null;
        }
    };

    /**
     * Set the current number of tiles
     * @param {number} x How many tiles on the isometric X axis
     * @param {number} z How many tiles on the isometric Z axis
     */
    this.setNumTiles = function(x, z)
    {
        initialize();
        if (x && z && terrainNotAddedToScene())
        {
            wade.addSceneObject(terrain, true);
        }
        else if (!x && !z && !terrainNotAddedToScene())
        {
            wade.removeSceneObject(terrain);
        }
        terrainBehavior.setNumTiles(x, z);
    };

    /**
     * Create an isometric object
     * @param {Object} [objectData] An object containing some the following fields (they are all optional) describing the properties of the object type. This is a sort of object template, that is shared by all instances of this type of object:
     * <ul>
     *     <li><b>gridMap</b>: An array of objects with <i>x</i> and <i>z</i> fields describing offsets (with respect to the object's main tile) of which terrain tiles are being used by the object. This is done so you can use getObjectsInTile(). Default [{x:0, z:0}].</li>
     *     <li><b>collisionMap</b>: An array of objects (in the same way as <i>gridMap</i>), that describes which tiles have collisions (with respect to the object's main tile). By default this is not set, meaning no collisions.</li>
     *     <li><b>gridSize</b>: An object with x and z fields representing the size of the gridMap. When a gridMap represents a regular (rectangular) area, it's often more convenient to us this parameter rather than gridMap.</li>
     *     <li><b>collisionSize</b>: An object with x and z fields representing the size of the collisionMap. When a collisionMap represents a regular (rectangular) area, it's often more convenient to us this parameter rather than collisionMap.</li>
     *     <li><b>behaviors</b>: An array (or a single Behavior) with any Behaviors to be attached to the object.</li>
     *     <li><b>dontAddToScene</b>: A flag that can be set to <i>true</i> if you want to create the object without adding it to the scene.</li>
     *     <li><b>sprites</b>: An object, or an array of objects, describing one or more sprites. See the documentation for the Sprite object for a complete description of all the properties that you can define for each Sprite and its Animations.</li>
     *     <li><b>properties</b>: An object containing any custom properties that you want to copy into the new isometric object</li>
     * </ul>
     * @param {{x: number, z: number}} [gridCoords] An object representing the tile coordinates of the object on the isometric grid. Default is {x:0, z: 0}
     * @param {Object} [instanceData] An object with data to be attached to the newly created object. You can use the special 'name' field of this object to give your object a name, but it must be unique.<br/>
     * You can use the special 'functions' object to assign functions to the object. The 'functions' object be in the format {functionName1: functionCode1, functionName2: functionCode2, ...} where functionCode is always a string.
     * @returns {SceneObject} A scene object that has been set up for use in the isometric world
     */
    this.createObject = function(objectData, gridCoords, instanceData)
    {
        initialize();
        objectData = objectData || {};
        instanceData = instanceData || {};
        gridCoords = gridCoords || {x: 0, z: 0};
        var worldCoords = terrainBehavior.getFlatWorldCoordinates(gridCoords.x, gridCoords.z);

        // extend instanceData with any custom properties defined in objectData
        if (objectData.properties && Object.keys(objectData.properties).length)
        {
            var temp = {};
            wade.extend(true, temp, objectData.properties, instanceData);
            instanceData = temp;
        }

        // if gridMap and collisionMap aren't set, but gridSize and collisionSize are, build the maps
        var i, j, x, z;
        if (!objectData.gridMap)
        {
            if (objectData.gridSize)
            {
                objectData.gridMap = [];
                for (i=0; i<objectData.gridSize.x; i++)
                {
                    for (j=0; j<objectData.gridSize.z; j++)
                    {
                        objectData.gridMap.push({x:i, z:j});
                    }
                }
            }
            else
            {
                objectData.gridMap = [{x:0, z:0}];
            }
        }
        if (!objectData.collisionMap && objectData.collisionSize)
        {
            objectData.collisionMap = [];
            for (i=0; i<objectData.collisionSize.x; i++)
            {
                for (j=0; j<objectData.collisionSize.z; j++)
                {
                    objectData.collisionMap.push({x:i, z:j});
                }
            }
        }

        // if we have collisions and there's already an object with collisions occupying any of the tiles that the new object should occupy, return null
        var gridMap = objectData.gridMap;
        var collisionMap = objectData.collisionMap;
        if (collisionMap)
        {
            for (i=0; i<collisionMap.length; i++)
            {
                x = collisionMap[i].x + gridCoords.x;
                z = collisionMap[i].z + gridCoords.z;
                if (!this.collisionMap[x])
                {
                    this.collisionMap[x] = [];
                }
                else if (this.collisionMap[x][z])
                {
                    return null;
                }
            }
        }

        // create sprites with all the animations defined in the object data
        var sprites = [];
        var spriteOffsets = [];
        if (objectData.sprites)
        {
            var objectDataSprites = wade.isArray(objectData.sprites)? objectData.sprites : [objectData.sprites];
            for (i=0; i<objectDataSprites.length; i++)
            {
                var spriteData = objectDataSprites[i];
                spriteData.layer = objectsLayerId;
                if (!spriteData.sortPoint)
                {
                    spriteData.sortPoint = {x:0, y: 0.5};
                }
                var sprite = spriteData.type == 'TextSprite'? new TextSprite(spriteData) : new Sprite(spriteData);
                sprites.push(sprite);
                sprite.baseOffset = spriteData.offset || {x:0, y:0};
                spriteOffsets.push({x: sprite.baseOffset.x, y: sprite.baseOffset.y - this.getTileHeight(gridCoords.x, gridCoords.z)});
            }
        }

        // create a scene object
        var behaviors = objectData.behaviors;
        if (behaviors)
        {
            if (!wade.isArray(behaviors))
            {
                behaviors = [behaviors];
            }
            for (var b=0; b<behaviors.length; b++)
            {
                if (typeof(behaviors[b]) == 'string')
                {
                    if (typeof(window[behaviors[b]]) == 'function')
                    {
                        behaviors[b] = window[behaviors[b]];
                    }
                    else
                    {
                        (function(name)
                        {
                            behaviors[b] = function()
                            {
                                this.name = name;
                            };
                        })(behaviors[b]);
                    }
                }
            }
        }
        var sceneObject = new SceneObject(sprites, behaviors, worldCoords.x, worldCoords.y, instanceData.name);
        sceneObject.setSpriteOffsets(spriteOffsets);

        // add iso properties to the object
        sceneObject.iso = {objectData: objectData, gridCoords: {x: gridCoords.x, z: gridCoords.z}};

        // add all instance data properties to the object (name and functions are special cases)
        wade.extend(sceneObject, instanceData);
        delete sceneObject.name;
        if (sceneObject.functions)
        {
            var f = sceneObject.functions;
            delete sceneObject.functions;
            sceneObject.importFunctions(f);
        }

        // add the object to the scene unless the object data or the instance data say otherwise
        if (!objectData.dontAddToScene && !instanceData.dontAddToScene)
        {
            wade.addSceneObject(sceneObject, true);
        }

        // store the game object into an array
        this.gameObjects.push(sceneObject);

        // mark the appropriate grid tiles as being occupied by the new object
        for (i=0; i<gridMap.length; i++)
        {
            x = gridMap[i].x + gridCoords.x;
            z = gridMap[i].z + gridCoords.z;
            if (!this.gridObjects[x])
            {
                this.gridObjects[x] = [];
            }
            if (!this.gridObjects[x][z])
            {
                this.gridObjects[x][z] = [];
            }
            this.gridObjects[x][z].push(sceneObject);
        }
        if (objectData.collisionMap)
        {
            for (i=0; i<objectData.collisionMap.length; i++)
            {
                x = objectData.collisionMap[i].x + gridCoords.x;
                z = objectData.collisionMap[i].z + gridCoords.z;
                if (!this.collisionMap[x])
                {
                    this.collisionMap[x] = [];
                }
                this.collisionMap[x][z] = sceneObject;
            }
        }
        return sceneObject;
    };

    /**
     * Delete an object that was previously created with a call to createObject(), or as part of an isometric map file.
     * @param {SceneObject} sceneObject The object to delete
     */
    this.deleteObject = function(sceneObject)
    {
        initialize();
        wade.removeObjectFromArray(sceneObject, this.gameObjects);
        // mark the appropriate grid tiles as free
        var i, x, z;
        var collisionMap = sceneObject.iso.objectData.collisionMap;
        if (collisionMap)
        {
            for (i=0; i<collisionMap.length; i++)
            {
                x = collisionMap[i].x + sceneObject.iso.gridCoords.x;
                z = collisionMap[i].z + sceneObject.iso.gridCoords.z;
                this.collisionMap[x] && this.collisionMap[x][z] && (this.collisionMap[x][z] = 0);
            }
        }
        var gridMap = sceneObject.iso.objectData.gridMap;
        gridMap = gridMap || [{x:0, z:0}];
        for (i=0; i<gridMap.length; i++)
        {
            x = gridMap[i].x + sceneObject.iso.gridCoords.x;
            z = gridMap[i].z + sceneObject.iso.gridCoords.z;
            this.gridObjects[x] && this.gridObjects[x][z] && wade.removeObjectFromArray(sceneObject, this.gridObjects[x][z]);
        }
        wade.removeSceneObject(sceneObject);
    };

    /**
     * Remove all objects, clear all collision data, and restore the state to what it would be just after initialization
     */
    this.reset = function()
    {
        if (!initialized)
        {
            initialize();
            return;
        }
        movingObjects.length = 0;
        loadingState = {};
        this.setNumTiles(0, 0);
        this.gameObjects.length = this.gridObjects.length = this.collisionMap.length = 0;
    };

    /**
     * Delete the object with the specified name
     * @param {string} name The name of the object to delete
     */
    this.deleteObjectByName = function(name)
    {
        var object = initialized && wade.getSceneObject(name);
        object && this.deleteObject(object);
    };

    /**
     * Delete all the objects in a tile
     * @param {number} x The isometric X coordinate of the tile
     * @param {number} z The isometric Z coordinate of the tile
     * @returns {boolean} Whether any object was found and deleted
     */
    this.deleteObjectsInTile = function(x, z)
    {
        if (!initialized || !this.gridObjects[x])
        {
            return false;
        }
        var gameObjects = this.gridObjects[x][z];
        if (!gameObjects)
        {
            return false;
        }
        if (gameObjects.length)
        {
            for (var i=gameObjects.length-1; i>=0; i--)
            {
                this.deleteObject(gameObjects[i]);
            }
            return true;
        }
        return false;
    };

    /**
     * Restrict the camera so that it never shows anything outside of the isometric terrain boundaries. Note that this can only work if your terrain is big enough (depending on the zoom level), and when you do this some areas of the map (near the corners and edges) may never be visible, depending on your aspect ratio.
     * @param {boolean} [toggle] Whether to constrain the camera or not. If omitted, it is assumed to be true.
     */
    this.constrainCamera = function(toggle)
    {
        initialize();
        if (typeof(toggle) == 'undefined')
        {
            toggle = true;
        }
        if (!toggle)
        {
            wade.setMainLoop(null, '_wade_isoConstrainCamera');
        }
        else
        {
            wade.setMainLoop(function()
            {
                // transform the screen box into world space
                var halfScreenWidth = wade.getScreenWidth() / 2;
                var halfScreenHeight = wade.getScreenHeight() / 2;
                var screenBox = {minX: -halfScreenWidth, minY: -halfScreenHeight, maxX: halfScreenWidth, maxY: halfScreenHeight};
                var worldBox = wade.getLayer(terrainLayerId).screenBoxToWorld(screenBox);
                var wsHalfScreenWidth = (worldBox.maxX - worldBox.minX) / 2;
                var wsHalfScreenHeight = (worldBox.maxY - worldBox.minY) / 2;

                // get world-space coordinates for the terrain grid corners
                var wsGridCorners = {};
                wsGridCorners.bottom = {x: 0, y: 0};
                wsGridCorners.left = terrainBehavior.getWorldCoordinates(0, terrainBehavior.numTilesZ - 1);
                wsGridCorners.left.x -= terrainBehavior.c_tileSize.x / 2;
                wsGridCorners.right = terrainBehavior.getWorldCoordinates(terrainBehavior.numTilesX - 1, 0);
                wsGridCorners.right.x += terrainBehavior.c_tileSize.x / 2;
                wsGridCorners.top = terrainBehavior.getWorldCoordinates(terrainBehavior.numTilesX - 1, terrainBehavior.numTilesZ - 1);
                wsGridCorners.top.y -= terrainBehavior.c_tileSize.y / 2;

                // get a line equation for each edge of the grid in world space
                var makeLine = function(start, end)
                {
                    var line = {};
                    line.start = start;
                    line.end = end;
                    line.slope = (end.y - start.y) / (end.x - start.x);
                    line.intercept = line.start.y - line.start.x * line.slope;
                    line.getX = function(y)
                    {
                        return (y - this.intercept) / this.slope;
                    };
                    return line;
                };
                var wsGridEdges = {};
                wsGridEdges.bottomRight = makeLine(wsGridCorners.bottom, wsGridCorners.right);
                wsGridEdges.bottomLeft  = makeLine(wsGridCorners.bottom, wsGridCorners.left);
                wsGridEdges.topRight    = makeLine(wsGridCorners.top,    wsGridCorners.right);
                wsGridEdges.topLeft     = makeLine(wsGridCorners.top,    wsGridCorners.left);

                // the maximum and minimum y positions of the camera are such that the width of the screen in world space can fit in the grid corners
                var cameraPosition = wade.getCameraPosition();
                if (cameraPosition.y + wsHalfScreenHeight > -wsHalfScreenWidth / 2)
                {
                    cameraPosition.y = -wsHalfScreenWidth / 2 - wsHalfScreenHeight;
                }
                else if (cameraPosition.y - wsHalfScreenHeight < wsGridCorners.top.y + wsHalfScreenWidth / 2)
                {
                    cameraPosition.y = wsGridCorners.top.y + wsHalfScreenWidth / 2 + wsHalfScreenHeight;
                }

                // the maximum and minimum x positions of the camera are derived from the line equation of the grid edges
                cameraPosition.x -= Math.max(0, cameraPosition.x + wsHalfScreenWidth - Math.min(wsGridEdges.bottomRight.getX(cameraPosition.y + wsHalfScreenHeight), wsGridEdges.topRight.getX(cameraPosition.y - wsHalfScreenHeight)));
                cameraPosition.x += Math.max(0, Math.max(wsGridEdges.bottomLeft.getX(cameraPosition.y + wsHalfScreenHeight), wsGridEdges.topLeft.getX(cameraPosition.y - wsHalfScreenHeight)) - (cameraPosition.x - wsHalfScreenWidth));
                wade.setCameraPosition(cameraPosition);
            }, '_wade_isoConstrainCamera');
        }
    };

    /**
     * Create an object near another object
     * @param {string|SceneObject} otherObject The isometric scene object (or a string with the name of the object) near which the new object will be created
     * @param {object} objectData The object data for the object to create. Please refer to the documentation of <i>createObject()</i> for the details.
     * @param {object} instanceData The instance data for the object to create. Please refer to the documentation of <i>createObject()</i> for the details.
     * @param {number} [minOffsetX=-1] The minimum offset on the isometric X axis, relative to <i>otherObject</i>, where the new object should be created
     * @param {number} [minOffsetZ=-1] The minimum offset on the isometric Z axis, relative to <i>otherObject</i>, where the new object should be created
     * @param {number} [maxOffsetX=1] The maximum offset on the isometric X axis, relative to <i>otherObject</i>, where the new object should be created
     * @param {number} [maxOffsetZ=1] The maximum offset on the isometric Z axis, relative to <i>otherObject</i>, where the new object should be created
     * @returns {SceneObject} The new scene object that has been created, or null if it wasn't possible to create it (because all the tiles near the target object where occupied)
     */
    this.spawnObjectNearObject = function(otherObject,  objectData, instanceData, minOffsetX, minOffsetZ, maxOffsetX, maxOffsetZ)
    {
        initialize();
        var startCoords = typeof(otherObject) == 'string' ? wade.getSceneObject(otherObject).gridCoords : otherObject.gridCoords;
        var gridCoords;
        (typeof(minOffsetX) == 'undefined') && (minOffsetX = -1);
        (typeof(minOffsetZ) == 'undefined') && (minOffsetZ = -1);
        (typeof(maxOffsetX) == 'undefined') && (maxOffsetX = 1);
        (typeof(maxOffsetZ) == 'undefined') && (maxOffsetZ = 1);
        for (var i=minOffsetX; i<=maxOffsetX; i++)
        {
            for (var j=minOffsetZ; j<=maxOffsetZ; j++)
            {
                if (this.collisionMap[startCoords.x + i])
                {
                    if (this.collisionMap[startCoords.x + i][startCoords.z + j])
                    {
                        continue;
                    }
                }
                gridCoords = {x: startCoords.x + i, z:startCoords.z + j};
            }
        }
        if (gridCoords)
        {
            return this.createObject(objectData, gridCoords, instanceData);
        }
        return null;
    };

    /**
     * Swap the positions of two isometric objects
     * @param {SceneObject} a One of the objects to swap.
     * @param {SceneObject} b The other object to swap.
     */
    this.swapObjects = function(a, b)
    {
        initialize();
        var i, x, z;
        var gridMapA = a.iso.objectData.gridMap || [{x:0, z:0}];
        var gridMapB = b.iso.objectData.gridMap || [{x:0, z:0}];
        var collisionMapA = a.iso.objectData.collisionMap;
        var collisionMapB = b.iso.objectData.collisionMap;
        var gridCoordsA = a.iso.gridCoords;
        var gridCoordsB = b.iso.gridCoords;

        if (collisionMapA)
        {
            for (i=0; i<collisionMapA.length; i++)
            {
                x = collisionMapA[i].x + gridCoordsA.x;
                z = collisionMapA[i].z + gridCoordsA.z;
                this.collisionMap[x][z] = 0;
            }
        }
        for (i=0; i<gridMapA.length; i++)
        {
            x = gridMapA[i].x + gridCoordsA.x;
            z = gridMapA[i].z + gridCoordsA.z;
            wade.removeObjectFromArray(a, this.gridObjects[x][z]);
        }
        if (collisionMapB)
        {
            for (i=0; i<collisionMapB.length; i++)
            {
                x = collisionMapB[i].x + gridCoordsB.x;
                z = collisionMapB[i].z + gridCoordsB.z;
                this.collisionMap[x][z] = 0;
            }
        }
        for (i=0; i<gridMapB.length; i++)
        {
            x = gridMapB[i].x + gridCoordsB.x;
            z = gridMapB[i].z + gridCoordsB.z;
            wade.removeObjectFromArray(b, this.gridObjects[x][z]);
        }

        var tmp = gridCoordsA;
        gridCoordsA = gridCoordsB;
        gridCoordsB = tmp;
        a.iso.gridCoords = gridCoordsA;
        b.iso.gridCoords = gridCoordsB;

        if (collisionMapA)
        {
            for (i=0; i<collisionMapA.length; i++)
            {
                x = collisionMapA[i].x + gridCoordsA.x;
                z = collisionMapA[i].z + gridCoordsA.z;
                if (!this.collisionMap[x])
                {
                    this.collisionMap[x] = [];
                }
                this.collisionMap[x][z] = a;
            }
        }
        for (i=0; i<gridMapA.length; i++)
        {
            x = gridMapA[i].x + gridCoordsA.x;
            z = gridMapA[i].z + gridCoordsA.z;
            if (!this.gridObjects[x])
            {
                this.gridObjects[x] = [];
            }
            if (!this.gridObjects[x][z])
            {
                this.gridObjects[x][z] = [];
            }
            this.gridObjects[x][z].push(a);
        }
        if (collisionMapB)
        {
            for (i=0; i<collisionMapB.length; i++)
            {
                x = collisionMapB[i].x + gridCoordsB.x;
                z = collisionMapB[i].z + gridCoordsB.z;
                if (!this.collisionMap[x])
                {
                    this.collisionMap[x] = [];
                }
                this.collisionMap[x][z] = b;
            }
        }
        for (i=0; i<gridMapA.length; i++)
        {
            x = gridMapA[i].x + gridCoordsA.x;
            z = gridMapA[i].z + gridCoordsA.z;
            if (!this.gridObjects[x])
            {
                this.gridObjects[x] = [];
            }
            if (!this.gridObjects[x][z])
            {
                this.gridObjects[x][z] = [];
            }
            this.gridObjects[x][z].push(b);
        }
        a.setPosition(terrainBehavior.getFlatWorldCoordinates(gridCoordsA.x, gridCoordsA.z));
        b.setPosition(terrainBehavior.getFlatWorldCoordinates(gridCoordsB.x, gridCoordsB.z));
        var heightA = this.getTileHeight(gridCoordsA.x, gridCoordsA.z);
        var heightB = this.getTileHeight(gridCoordsB.x, gridCoordsB.z);
        for (i=0; i<a.getSpriteCount(); i++)
        {
            a.setSpriteOffset(i, a.getSprite(i).baseOffset - heightA);
        }
        for (i=0; i<b.getSpriteCount(); i++)
        {
            b.setHeightOffset(i, b.getSprite(i).baseOffset - heightB);
        }
    };

    /**
     * Find a path from a starting point on the isometric grid to a target point on the isometric grid.
     * @param {{x: number, z: number}} gridStart An object representing the starting point
     * @param {{x: number, z: number}} gridGoal An object representing the target point
     * @param {string} [movementType] A string describing the allowed movement type. It can be 'diagonal', 'straight' or 'both'. If omitted, the default movement type will be used (or the one that was set when wade.iso.init() was called).
     * @param {number} [maxStepHeight] If defined, this determines the maximum height difference between two tiles that will not block movement
	 * @param {number} [maxPathLength] If defined, this determines the maximum length of the path that can be returned
     * @returns {Array} An array of objects with x and z fields representing the tiles that make up the path from the starting point to the goal. Note that the starting point is not included. This may be an empty array if it wasn't possible to find a valid path.
     */
    this.findPath = function(gridStart, gridGoal, movementType, maxStepHeight, maxPathLength)
    {
        initialize();
        var useMaxStepHeight = typeof(maxStepHeight) != 'undefined';
        var i, j;
        var offsets = movementType? getMovementOffsets(movementType) : movementOffsets;
        var closedSet = [];
        var openSet = [gridStart];
        gridStart.gScore = 0;
        gridStart.hScore = Math.abs(gridStart.x - gridGoal.x) + Math.abs(gridStart.z - gridGoal.z);
        gridStart.fScore = gridStart.hScore;

        while (openSet.length)
        {
            var minFScore = openSet[0].fScore;
            var currentNode = openSet[0];
            var currentNodeIndex = 0;
            for (i=1; i<openSet.length; i++)
            {
                var node = openSet[i];
                var f = node.fScore;
                if (f < minFScore)
                {
                    currentNode = node;
                    minFScore = f;
                    currentNodeIndex = i;
                }
            }
            if (currentNode.x == gridGoal.x && currentNode.z == gridGoal.z)
            {
                var result = [];
                var resultNode = currentNode;
                while (resultNode.cameFrom)
                {
                    result.push(resultNode);
                    resultNode = resultNode.cameFrom;
                }
                result.push(gridStart);
                var reverseResult = [];
                for (i=0; i<result.length; i++)
                {
                    reverseResult.push(result[result.length-1-i]);
                }
                return reverseResult;
            }
            wade.removeObjectFromArrayByIndex(currentNodeIndex, openSet);
            closedSet.push(currentNode);
            if (maxPathLength && currentNode.gScore >= maxPathLength)
            {
                continue;
            }

            for (i=0; i<offsets.length; i++)
            {
                var offset = offsets[i];
                var neighbor = {x: currentNode.x + offset.x, z: currentNode.z + offset.z};
                if (neighbor.x < 0 || neighbor.z < 0 || neighbor.x >= terrainBehavior.numTilesX || neighbor.z >= terrainBehavior.numTilesZ)
                {
                    continue;
                }
                if (useMaxStepHeight && (Math.abs(this.getTileHeight(neighbor.x, neighbor.z) - this.getTileHeight(currentNode.x, currentNode.z)) > maxStepHeight))
                {
                    continue;
                }
                if (this.collisionMap[neighbor.x])
                {
                    if (this.collisionMap[neighbor.x][neighbor.z])
                    {
                        continue;
                    }
                }
                var neighborInClosedSet = false;
                for (j=0; j<closedSet.length; j++)
                {
                    var closedNode = closedSet[j];
                    if (closedNode.x == neighbor.x && closedNode.z == neighbor.z)
                    {
                        neighborInClosedSet = true;
                        break;
                    }
                }
                if (neighborInClosedSet)
                {
                    continue;
                }
                var tentativeGScore = currentNode.gScore + 1;
                var neighborInOpenSet = false;
                for (j=0; j<openSet.length; j++)
                {
                    var openNode = openSet[j];
                    if (openNode.x == neighbor.x && openNode.z == neighbor.z)
                    {
                        neighborInOpenSet = true;
                        neighbor = openNode;
                        break;
                    }
                }
                var tentativeIsBetter = false;
                if (!neighborInOpenSet)
                {
                    openSet.push(neighbor);
                    neighbor.hScore = Math.abs(neighbor.x - gridGoal.x) + Math.abs(neighbor.z - gridGoal.z);
                    tentativeIsBetter = true;
                }
                else if (tentativeGScore < neighbor.gScore)
                {
                    tentativeIsBetter = true;
                }
                if (tentativeIsBetter)
                {
                    neighbor.cameFrom = currentNode;
                    neighbor.gScore = tentativeGScore;
                    neighbor.fScore = neighbor.gScore + neighbor.hScore;
                }
            }
        }
        return [];
    };

    /**
     * Move an isometric object to a specific tile, with a custom speed or instantly
     * @param {SceneObject|string} object The object to move (or the name of the object to move)
     * @param {number} targetX The isometric X coordinate of the target tile
     * @param {number} targetZ The isometric Z coordinate of the target tile
     * @param {number} [speed] The movement speed, in world units. If omitted or false, the object is moved instantly to the target position
     * @returns {boolean} Whether it was possible to move the object
     */
    this.moveObjectToTile = function(object, targetX, targetZ, speed)
    {
        initialize();
        if (typeof(object) == 'string')
        {
            object = wade.getSceneObject(object);
            if (!object)
            {
                return false;
            }
        }
        if (!speed)
        {
            if (updateObjectTile(object, targetX, targetZ))
            {
                object.setPosition(terrainBehavior.getFlatWorldCoordinates(targetX, targetZ));
                object.iso.targetCoords = 0;
                wade.removeObjectFromArray(object, movingObjects);
                return true;
            }
            else
            {
                return false;
            }
        }
        if (object.iso.gridCoords.x == targetX && object.iso.gridCoords.z == targetZ)
        {
            return true;
        }
        object.iso.targetCoords = {x: targetX, z: targetZ};
        object.iso.previousPosition = object.getPosition();
        movingObjects.push(object);
        var worldCoords = terrainBehavior.getFlatWorldCoordinates(targetX, targetZ);
        object.moveTo(worldCoords.x, worldCoords.y, speed);
        return true;
    };

    /**
     * Change a tile on the isometric terrain
     * @param {number} x The tile index on the isometric X axis
     * @param {number} z The tile index on the isometric Z axis
     * @param {Object} [tileData] An object with the following fields (they are all optional) representing the tile data. If this is omitted or falsy, the tile is effectively removed, leaving a hole in the terrain. Note that you cannot remove tiles where there are objects with collisions. Parameters:
     * <ul>
     *     <li><b>texture</b>: An image file name (or virtual path) to use for the tile</li>
     *     <li><b>scale</b>: A scale factor to apply to the tile sprite (default is 1)</li>
     *     <li><b>rotation</b>: This can be an integer number between 0 and 3 included, that indicates how many times the source texture should be rotated by 90 degrees clockwise</li>
     *     <li><b>animation</b>: An animation object to use for the tile, with some of the following fields. The animation is always played in forward looping mode</li>
     *     <li><b>customHeight</b>: A boolean describing whether the height of this tile should be inferred from the texture size rather than being set to the current isometric tile height</li>
     *     <li><b>collision</b>: A boolean describing whether this tile should block object movement and affect the result of findPath</li>
     *     <ul>
     *         <li><b>numFrames</b>: An object with x and y fields representing the number of frames in the spritesheet</li>
     *         <li><b>speed</b>: The number of frames per second</li>
     *     </ul>
     * </ul>
     * @param {number} [heightOffset=0] A height offset for this tile that will affect the world position of the tile and any objects on the tile. By default this is 0.
     * @returns boolean Whether it was possible to set the tile. It may not be possible if the tile has got a collision flag and there are other objects with collision maps on the tile.
     */
    this.setTile = function(x, z, tileData, heightOffset)
    {
        initialize();
        return terrainBehavior.setTile(x, z, tileData, heightOffset);
    };

    /**
     * Change a terrain transition on the isometric terrain
     * @param {number} x The tile index on the isometric X axis
     * @param {number} z The tile index on the isometric Z axis
     * @param {Object} [data] An object with the following fields (they are all optional) representing the transition data. If this is omitted or falsy, the transition is removed:
     * <ul>
     *     <li><b>texture</b>: An image file name (or virtual path) to use for the transition</li>
     *     <li><b>scale</b>: A scale factor to apply to the transition sprite (default is 1)</li>
     *     <li><b>rotation</b>: This can be an integer number between 0 and 3 included, that indicates how many times the source texture should be rotated by 90 degrees clockwise</li>
     *     <li><b>animation</b>: An animation object to use for the transition, with some of the following fields. The animation is always played in forward looping mode.</li>
     *     <ul>
     *         <li><b>numFrames</b>: An object with x and y fields representing the number of frames in the spritesheet</li>
     *         <li><b>speed</b>: The number of frames per second</li>
     *     </ul>
     * </ul>
     */
    this.setTransition = function(x, z, data)
    {
        initialize();
        terrainBehavior.setTransition(x, z, data);
    };

    /**
     * Change a terrain detail on the isometric terrain
     * @param {number} x The tile index on the isometric X axis
     * @param {number} z The tile index on the isometric Z axis
     * @param {Object} [data] An object with the following fields (they are all optional) representing the detail data. If this is omitted or falsy, the detail is removed:
     * <ul>
     *     <li><b>texture</b>: An image file name (or virtual path) to use for the detail</li>
     *     <li><b>scale</b>: A scale factor to apply to the detail sprite (default is 1)</li>
     *     <li><b>rotation</b>: This can be an integer number between 0 and 3 included, that indicates how many times the source texture should be rotated by 90 degrees clockwise</li>
     *     <li><b>animation</b>: An animation object to use for the detail, with some of the following fields. The animation is always played in forward looping mode.</li>
     *     <ul>
     *         <li><b>numFrames</b>: An object with x and y fields representing the number of frames in the spritesheet</li>
     *         <li><b>speed</b>: The number of frames per second</li>
     *     </ul>
     * </ul>
     */
    this.setDetail = function(x, z, data)
    {
        initialize();
        terrainBehavior.setDetail(x, z, data);
    };

    /**
     * Get the coordinates, in world space, corresponding to an isometric tile
     * @param {number} tileX The tile index on the isometric X axis
     * @param {number} tileZ The tile index on the isometric Z axis
     * @returns {{x: number, y: number}} An object representing the world space position corresponding to the tile.
     */
    this.getWorldCoordinates = function(tileX, tileZ)
    {
        initialize();
        return terrainBehavior.getWorldCoordinates(tileX, tileZ);
    };

    /**
     * Get the coordinates, in world space, corresponding to an isometric tile ignoring the height offsets of all tiles
     * @param {number} tileX The tile index on the isometric X axis
     * @param {number} tileZ The tile index on the isometric Z axis
     * @returns {{x: number, y: number}} An object representing the world space position corresponding to the tile.
     */
    this.getFlatWorldCoordinates = function(tileX, tileZ)
    {
        initialize();
        return terrainBehavior.getFlatWorldCoordinates(tileX, tileZ);
    };

    /**
     * Get the tile coordinates (indices) corresponding to the spefified world-space positions
     * @param {number} worldX The X coordinate of the world-space position
     * @param {number} worldY The Y coordinate of the world-space position
     * @returns {{x: number, z: number, valid: boolean}} An object with the tile x and z indices. There is also a <i>valid</i> flag indicating whether the tile is inside the current terrain boundaries.
     */
    this.getTileCoordinates = function(worldX, worldY)
    {
        initialize();
        return terrainBehavior.getTileCoordinates(worldX, worldY);
    };

    /**
     * Get the tile coordinates (indices) corresponding to the spefified world-space positions ignoring the height offsets of all tiles
     * @param {number} worldX The X coordinate of the world-space position
     * @param {number} worldY The Y coordinate of the world-space position
     * @returns {{x: number, z: number, valid: boolean}} An object with the tile x and z indices. There is also a <i>valid</i> flag indicating whether the tile is inside the current terrain boundaries.
     */
    this.getFlatTileCoordinates = function(worldX, worldY)
    {
        initialize();
        return terrainBehavior.getFlatTileCoordinates(worldX, worldY);
    };

    /**
     * Get the name of the image file (or virtual path) that is being used for the tile at the specified tile coordinates
     * @param {number} x The index of the tile on the isometric X axis
     * @param {number} z The index of the tile on the isometric Z axis
     * @returns {string} The image file name, or an empty string if there are no tiles at the specified tile coordinates
     */
    this.getTileTexture = function(x, z)
    {
        return initialized && terrainBehavior.getTileTexture(x, z);
    };

    /**
     * Set an image to be displayed on the terrain tile where the mouse is being moved. This can be extended to multiple tiles by using the <i>offsets</i> parameter.
     * @param {string} texture The name of the image file (or virtual path) to use
     * @param {Array} [offsets] An array of objects with x and z fields representing the offsets (relative to the tile where the mouse is) of the tiles to highlight. Default is [{x:0, z:0}]
     */
    this.setHighlight = function(texture, offsets)
    {
        initialize();
        terrainBehavior.setHighlight(texture, offsets);
    };


	/**
     * Get the scene objects that are currently used to higlight terrain tiles, if any
     * @returns {Array} An array of SceneObjects
     */
    this.getHighlightObjects = function()
    {
        return initialized? terrainBehavior.getHighlightObjects() : [];
    };

    /**
     * Get all the objects in the specified terrain tile
     * @param {number} x The index of the tile on the isometric X axis
     * @param {number} z The index of the tile on the isometric Z axis
     * @returns {Array} An array containing all the objects in the tile
     */
    this.getObjectsInTile = function(x, z)
    {
        initialize();
        var objects = (this.gridObjects[x] && this.gridObjects[x][z]);
        return (objects && wade.cloneArray(objects)) || [];
    };

    /**
     * Force wade.iso to sort the terrain tiles. This may be useful if you are adding and removing tiles and transitions dynamically at run-time.
     */
    this.sortTerrainTiles = function()
    {
        initialize();
        terrainBehavior.sort();
    };

    /**
     * Draw a grid on the isometric terrain. Very useful during development and for debugging.
     * @param {boolean} [toggle] Whether to draw the grid or not. If omitted, it's assumed to be true.
     */
    this.drawGrid = function(toggle)
    {
        initialize();
        if (typeof(toggle) == 'undefined')
        {
            toggle = true;
        }
        terrainBehavior.drawGrid(toggle);
    };

    /**
     * Get a draw function (to use with <i>Sprite.setDrawFunction()</i>) that drawa an isometric tile, that can optionally be filled with a solid color and have borders of a different color
     * @param {string} [borderColor] An HTML color string to use for the borders, for example 'white', '#ffffff', 'rgba(255, 255, 255, 1)' and so on. If omitted or falsy, no borders will be drawn.
     * @param {string} [fillColor] An HTML color string to use for the fill color, for example 'white', '#ffffff', 'rgba(255, 255, 255, 1)' and so on. If omitted or falsy, the tile image won't be filled.
     * @returns {Function} The function to use with Sprite.setDrawFunction()
     */
    this.draw_ = function(borderColor, fillColor)
    {
        fillColor = fillColor || 'blue';
        return function(context)
        {
            var pos = this._position;
            var w = this._size.x / 2;
            var h = this._size.y / 2;

            var strokeStyle = context.strokeStyle;
            var fillStyle = context.fillStyle;

            borderColor && (context.strokeStyle = borderColor);
            context.fillStyle = fillColor;
            context.beginPath();
            context.moveTo(pos.x - w,   pos.y);
            context.lineTo(pos.x,       pos.y + h);
            context.lineTo(pos.x + w,   pos.y);
            context.lineTo(pos.x,       pos.y - h);
            strokeStyle && context.stroke();
            fillStyle && context.fill();
            context.strokeStyle = strokeStyle;
            context.fillStyle = fillStyle;
        };
    };

    /**
     * Export the current map and its state to a JSON object that can be passed into the map parameter of wade.iso.init()
     * @param {boolean} [stringify] Whether to serialize the resulting JSON object to a string
     * @returns {object|string} The JSON object (or JSON string) representing the current map
     */
    this.exportMap = function(stringify)
    {
        initialize();
        // initialize map data
        var mapData =
        {
            version: "1.1",
            terrain:
            {
                numTilesX: terrainBehavior.numTilesX,
                numTilesZ: terrainBehavior.numTilesZ,
                tileData: [],
                tileDataIds: [],
                transitionData: [],
                transitionDataIds: [],
                detailData: [],
                detailDataIds: [],
                tileHeight: []
            },
            gameObjectData: [],
            gameObjects: []
        };

        // save tiles and transitions
        for (var i=0; i<terrainBehavior.numTilesX; i++)
        {
            mapData.terrain.tileDataIds[i] = [];
            mapData.terrain.transitionDataIds[i] = [];
            mapData.terrain.tileHeight[i] = [];
            for (var j=0; j<terrainBehavior.numTilesZ; j++)
            {
                if (terrainBehavior.tileData[i] && terrainBehavior.tileData[i][j])
                {
                    var tileData = terrainBehavior.tileData[i][j];
                    var index = mapData.terrain.tileData.indexOf(tileData);
                    if (index == -1)
                    {
                        index = mapData.terrain.tileData.push(tileData) - 1;
                    }
                    mapData.terrain.tileDataIds[i][j] = index;
                    mapData.terrain.tileHeight[i][j] = terrainBehavior.tileHeight[i] && terrainBehavior.tileHeight[i][j] || 0;
                }
                else
                {
                    mapData.terrain.tileDataIds[i][j] = -1;
                }
                if (terrainBehavior.transitionData[i] && terrainBehavior.transitionData[i][j])
                {
                    var transitionData = terrainBehavior.transitionData[i][j];
                    index = mapData.terrain.transitionData.indexOf(transitionData);
                    if (index == -1)
                    {
                        index = mapData.terrain.transitionData.push(transitionData) - 1;
                    }
                    mapData.terrain.transitionDataIds[i][j] = index;
                }
                else
                {
                    mapData.terrain.transitionDataIds[i][j] = -1;
                }
            }
        }

        // save details
        for (i=0; i<terrainBehavior.numTilesX; i++)
        {
            mapData.terrain.detailDataIds[i] = [];
            for (j=0; j<terrainBehavior.numTilesZ; j++)
            {
                if (terrainBehavior.detailData[i] && terrainBehavior.detailData[i][j])
                {
                    var detailData = terrainBehavior.detailData[i][j];
                    index = mapData.terrain.detailData.indexOf(detailData);
                    if (index == -1)
                    {
                        index = mapData.terrain.detailData.push(detailData) - 1;
                    }
                    mapData.terrain.detailDataIds[i][j] = index;
                }
                else
                {
                    mapData.terrain.detailDataIds[i][j] =  -1;
                }
            }
        }

        // save game objects
        var sceneObjects = this.gameObjects;
        for (i=0; i<sceneObjects.length; i++)
        {
            if (sceneObjects[i].iso && sceneObjects[i].iso.objectData && sceneObjects[i].iso.gridCoords)
            {
                var objectData = sceneObjects[i].iso.objectData;
                index = mapData.gameObjectData.indexOf(objectData);
                if (index == -1)
                {
                    index = mapData.gameObjectData.push(objectData) - 1;
                }
                var obj =
                {
                    templateId: index,
                    gridCoords:
                    {
                        x: sceneObjects[i].iso.gridCoords.x || 0,
                        z: sceneObjects[i].iso.gridCoords.z || 0
                    }
                };
				var serialized = sceneObjects[i].serialize(false, ['iso']);
                obj.instanceData = serialized.properties || {};
                obj.instanceData.name = sceneObjects[i].getName();
                objectData.behaviors = [];
                for (j=0; j<serialized.behaviors.length; j++)
                {
                    objectData.behaviors.push(serialized.behaviors[j].name);
                }
                mapData.gameObjects.push(obj);
            }
        }
        if (stringify)
        {
            try
            {
                mapData = JSON.stringify(mapData);
            }
            catch (e)
            {
                wade.log("Unable to convert map data to a string. It may contain circular references.")
            }
        }
        return mapData;
    };

    var updateObjectTile = function(object, targetX, targetZ)
    {
        initialize();
        if (object.iso.gridCoords.x == targetX && object.iso.gridCoords.z == targetZ)
        {
            return true;
        }

        // check that it's OK to change tile (i.e. there are no collision objects in any of the target tiles)
        var i, x, z;
        var gridMap = object.iso.objectData.gridMap || [{x:0, z:0}];
        var collisionMap = object.iso.objectData.collisionMap;
        if (collisionMap)
        {
            for (i=0; i<collisionMap.length; i++)
            {
                x = collisionMap[i].x + targetX;
                z = collisionMap[i].z + targetZ;
                if (self.collisionMap[x] && self.collisionMap[x][z] && self.collisionMap[x][z] != object)
                {
                    return false;
                }
            }
        }

        // remove from the current tile(s)
        for (i=0; i<gridMap.length; i++)
        {
            x = gridMap[i].x + object.iso.gridCoords.x;
            z = gridMap[i].z + object.iso.gridCoords.z;
            wade.removeObjectFromArray(object, self.gridObjects[x][z]);
        }
        if (collisionMap)
        {
            for (i=0; i<collisionMap.length; i++)
            {
                x = collisionMap[i].x + object.iso.gridCoords.x;
                z = collisionMap[i].z + object.iso.gridCoords.z;
                self.collisionMap[x] && self.collisionMap[x][z] && (self.collisionMap[x][z] = 0);
            }
        }

        // add to the new tiles
        for (i=0; i<gridMap.length; i++)
        {
            x = gridMap[i].x + targetX;
            z = gridMap[i].z + targetZ;
            if (!self.gridObjects[x])
            {
                self.gridObjects[x] = [];
            }
            if (!self.gridObjects[x][z])
            {
                self.gridObjects[x][z] = [];
            }
            self.gridObjects[x][z].push(object);
        }
        if (collisionMap)
        {
            for (i=0; i<collisionMap.length; i++)
            {
                x = collisionMap[i].x + targetX;
                z = collisionMap[i].z + targetZ;
                if (!self.collisionMap[x])
                {
                    self.collisionMap[x] = [];
                }
                self.collisionMap[x][z] = object;
            }
        }

        // update object data
        if (object.iso.gridCoords.x != targetX || object.iso.gridCoords.z != targetZ)
        {
            var previousTile = {x: object.iso.gridCoords.x, z: object.iso.gridCoords.z};
        }
        object.iso.gridCoords.x = targetX;
        object.iso.gridCoords.z = targetZ;

        // update sprite offsets
        for (i=0; i<object.getSpriteCount(); i++)
        {
            var sprite = object.getSprite(i);
            var baseOffset = sprite.baseOffset;
            object.setSpriteOffset(i, {x: baseOffset.x, y: baseOffset.y - self.getTileHeight(targetX, targetZ)});
        }

        if (previousTile)
        {
            object.process('onIsoTileChange', {previousTile: previousTile, currentTile: {x: targetX, z: targetZ}});
        }

        return true;
    };

    var finishedLoading_ = function(what, callback)
    {
        return function()
        {
            loadingState[what] = 1;
            if (loadingState['terrain'] && loadingState['objects'])
            {
                callback && callback();
            }
        };
    };

    var getMovementOffsets = function(movementType)
    {
        switch (movementType)
        {
            case 'straight':
                return [{x: -1, z: -1}, {x: -1, z: 1}, {x: 1, z: -1}, {x: 1, z: 1}];
                break;
            case 'diagonal':
                return [{x: 0, z: -1}, {x: 0, z: 1}, {x: -1, z: 0}, {x: 1, z: 0}];
                break;
            case 'both':
                return [{x: -1, z: -1}, {x: -1, z: 1}, {x: 1, z: -1}, {x: 1, z: 1}, {x: 0, z: -1}, {x: 0, z: 1}, {x: -1, z: 0}, {x: 1, z: 0}];
                break;
        }
        return [];
    };

    var loadObjects = function(dataObject, callback)
    {
        var i, j, k, p;

        // count loading requests
        var loadingList = [];
        var processedFiles = {};
        var completeRequests = 0;
        if (dataObject.gameObjects)
        {
            for (i=0; i<dataObject.gameObjectData.length; i++)
            {
                for (j=0; j<dataObject.gameObjectData[i].sprites.length; j++)
                {
                    var objectTexture = dataObject.gameObjectData[i].sprites[j].image;
                    if (objectTexture && !processedFiles[objectTexture])
                    {
                        loadingList.push(objectTexture);
                        processedFiles[objectTexture] = 1;
                    }
                    if (dataObject.gameObjectData[i].sprites[j].animations)
                    {
                        for (k=0; k<dataObject.gameObjectData[i].sprites[j].animations.length; k++)
                        {
                            objectTexture = dataObject.gameObjectData[i].sprites[j].animations[k].image;
                            if (!processedFiles[objectTexture])
                            {
                                loadingList.push(objectTexture);
                                processedFiles[objectTexture] = 1;
                            }
                        }
                    }
                }
                var portraits = dataObject.gameObjectData[i].portraits;
                if (portraits)
                {
                    for (p in portraits)
                    {
                        if (portraits.hasOwnProperty(p))
                        {
                            if (!processedFiles[portraits[p]])
                            {
                                loadingList.push(portraits[p]);
                                processedFiles[portraits[p]] = 1;
                            }
                        }
                    }
                }
            }

            // load data
            if (loadingList.length)
            {
                for (i=0; i<loadingList.length; i++)
                {
                    wade.loadImage(loadingList[i], function()
                    {
                        // if we're finished loading
                        if (++completeRequests == loadingList.length)
                        {
                            if (dataObject.gameObjects)
                            {
                                var terrainBehavior = terrain.getBehavior('TerrainBehavior');
                                for (var i=0; i<dataObject.gameObjects.length; i++)
                                {
                                    var gridCoords = dataObject.gameObjects[i].gridCoords;
                                    var instanceData = dataObject.gameObjects[i].instanceData;
                                    self.createObject(dataObject.gameObjectData[dataObject.gameObjects[i].templateId], gridCoords, instanceData);
                                }
                            }
                            finishedLoading_('objects', callback)();
                        }
                    });
                }
            }
            else
            {
                finishedLoading_('objects', callback)();
            }
        }
		else
		{
			finishedLoading_('objects', callback)();
		}
    };

	var terrainNotAddedToScene = function()
	{
		return !wade.getSceneObject('iso_terrain');
	};

};

/**
 * This is the object used to interact with the isometric engine
 * @type {Wade_iso}
 */
wade.iso = new Wade_iso();

