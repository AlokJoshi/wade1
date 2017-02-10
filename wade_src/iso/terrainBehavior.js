function TerrainBehavior()
{
    this.name = 'TerrainBehavior';
    this.tileSprites = [];
    this.tileData = [];
    this.gridSprites = [];
    this.transitionSprites = [];
    this.transitionData = [];
    this.detailSprites = [];
    this.detailData = [];
    this.tileHeight = [];
    this.c_tileSize = {x: 256, y: 128};
    this.c_origin = {x: 0, y: - this.c_tileSize.y / 2};
    this.numTilesX = 0;
    this.numTilesZ = 0;
    this.tileHighlightObjects = [];
    var drawingGrid = false;

    this.onAddToScene = function()
    {
        // start listening for mouse events
        this.owner.listenFor('onMouseDown');
        this.owner.listenFor('onMouseUp');
        this.owner.listenFor('onMouseClick');
        this.owner.listenFor('onMouseMove');

        // use a custom sort function for the terrain layer
        wade.setLayerSorting(wade.iso.getTerrainLayerId(), this.sortingFunction);
    };

    this.sortingFunction = function(spriteA, spriteB)
    {
        var delta = (spriteB.customSortIndex - spriteA.customSortIndex);
        return delta || (spriteA.customSortOrder - spriteB.customSortOrder);
    };

    this.getTileHighlightObject = function(index)
    {
        if (this.tileHighlightObjects[index])
        {
            return this.tileHighlightObjects[index];
        }
        else
        {
            if (this.highlightTexture)
            {
                var sprite = new Sprite(this.highlightTexture, wade.iso.getTerrainLayerId());
                sprite.setSize(this.c_tileSize.x, this.c_tileSize.y);
                sprite.customSortOrder = 4;
                sprite.customSortIndex = 0;
                this.tileHighlightObjects[index] = new SceneObject(sprite);
                this.tileHighlightObjects[index].iso = {gridCoords: {x:0, z: 0}};
                wade.addSceneObject(this.tileHighlightObjects[index]);
            }
            else if (this.highlightSprite)
            {
                sprite = this.highlightSprite.clone();
                sprite.customSortOrder = 4;
                sprite.customSortIndex = 0;
                this.tileHighlightObjects[index] = new SceneObject(sprite);
                this.tileHighlightObjects[index].iso = {gridCoords: {x:0, z: 0}};
                wade.addSceneObject(this.tileHighlightObjects[index]);
            }
            return this.tileHighlightObjects[index];
        }
    };

    this.hideTileHighlightObjects = function()
    {
        for (var i=0; i<this.tileHighlightObjects.length; i++)
        {
            this.tileHighlightObjects[i] && this.tileHighlightObjects[i].setVisible(false);
        }
    };

    this.getHighlightObjects = function()
    {
        return wade.extend([], this.tileHighlightObjects);
    };
    
    this.loadData_begin = function(dataObject, callback)
    {
        this.finishedLoading_ = false;
        this.loadingList = [];
        var processedFiles = {'_wade_isoDefault': 1};
        this.completeRequests = 0;
        var k, fileName;
        for (k=0; k<dataObject.terrain.tileData.length; k++)
        {
            fileName = dataObject.terrain.tileData[k].texture;
            if (!processedFiles[fileName])
            {
                this.loadingList.push(fileName);
                processedFiles[fileName] = 1;
            }
        }
        for (k=0; k<dataObject.terrain.transitionData.length; k++)
        {
            fileName = dataObject.terrain.transitionData[k].texture;
            if (!processedFiles[fileName])
            {
                this.loadingList.push(fileName);
                processedFiles[fileName] = 1;
            }
        }
        for (k=0; k<dataObject.terrain.detailData.length; k++)
        {
            fileName = dataObject.terrain.detailData[k].texture;
            if (!processedFiles[fileName])
            {
                this.loadingList.push(fileName);
                processedFiles[fileName] = 1;
            }
        }
		if (this.loadingList.length)
		{
			for (k=0; k<this.loadingList.length; k++)
			{
				wade.loadImage(this.loadingList[k], this.onLoadingRequestComplete_(dataObject, callback));
			}
		}
		else
		{
            this.onLoadingRequestComplete_(dataObject, callback)(true);
		}
    };

    this.onLoadingRequestComplete_ = function(dataObject, callback)
    {
        var that = this;
        return function(forceComplete)
        {
            if (forceComplete === true || ++that.completeRequests == that.loadingList.length)
            {
                that.loadData_end(dataObject);
                if (!that.owner.isInScene() && that.numTilesX && that.numTilesZ)
                {
                    wade.addSceneObject(that.owner, false);
                }
                that.finishedLoading_ = true;
                callback && callback();
            }
        }
    };

    this.loadData_end = function(dataObject)
    {
        var i, j;
        this.numTilesX = dataObject.terrain.numTilesX;
        this.numTilesZ = dataObject.terrain.numTilesZ;
        for (i=0; i<this.numTilesX; i++)
        {
            this.tileSprites[i] = [];
            this.tileData[i] = [];
            this.transitionSprites[i] = [];
            this.transitionData[i] = [];
            for (j=0; j<this.numTilesZ; j++)
            {
                var tileData = dataObject.terrain.tileData[dataObject.terrain.tileDataIds[i][j]];
                var tileHeight = dataObject.terrain.tileHeight && dataObject.terrain.tileHeight[i] && dataObject.terrain.tileHeight[i][j] || 0;
                this.setTile(i, j, tileData, tileHeight);
                var transitionData = dataObject.terrain.transitionData[dataObject.terrain.transitionDataIds[i][j]];
                if (transitionData)
                {
                    this.setTransition(i, j, transitionData);
                }
            }
        }
        for (i=0; i<this.numTilesX; i++)
        {
            this.detailSprites[i] = [];
            this.detailData[i] = [];
            for (j=0; j<this.numTilesZ; j++)
            {
                var detailData = dataObject.terrain.detailData[dataObject.terrain.detailDataIds[i][j]];
                if (detailData)
                {
                    this.setDetail(i, j, detailData);
                }
            }
        }
    };

    this.setNumTiles = function(numTilesX, numTilesZ)
    {
        var i, j;

        if (drawingGrid)
        {
            var _drawingGrid = true;
            this.drawGrid(false);
        }

        // remove existing data if we're setting a lower number of tiles
        for (i=numTilesX; i<this.numTilesX; i++)
        {
            for (j=0; j<this.numTilesZ; j++)
            {
                this.setTile(i, j, 0);
                this.setTransition(i, j, 0);
            }
        }
        for (j=numTilesZ; j<this.numTilesZ; j++)
        {
            for (i=0; i<this.numTilesX; i++)
            {
                this.setTile(i, j, 0);
                this.setTransition(i, j, 0);
            }
        }
        for (i=numTilesX; i<this.numTilesX; i++)
        {
            for (j=0; j<this.numTilesZ; j++)
            {
                this.setDetail(i, j, 0);
            }
        }
        for (j=numTilesZ; j<this.numTilesZ; j++)
        {
            for (i=0; i<this.numTilesX; i++)
            {
                this.setDetail(i, j, 0);
            }
        }

        this.tileData.length = this.transitionData.length = this.detailData.length = this.tileSprites.length = this.transitionSprites.length = this.detailSprites.length = this.gridSprites.length = this.tileHeight.length = numTilesX;
        for (i=0; i<numTilesX; i++)
        {
            this.tileData[i] && (this.tileData[i].length = numTilesZ);
            this.transitionData[i] && (this.transitionData[i].length = numTilesZ);
            this.detailData[i] && (this.detailData[i].length = numTilesZ);
            this.tileSprites[i] && (this.tileSprites[i].length = numTilesZ);
            this.transitionSprites[i] && (this.transitionSprites[i].length = numTilesZ);
            this.detailSprites[i] && (this.detailSprites[i].length = numTilesZ);
            this.gridSprites[i] && (this.gridSprites[i].length = numTilesZ);
            this.tileHeight[i] && (this.tileHeight[i].length = numTilesZ);
        }


        // create new tiles
        var defaultTileData = {texture: '_wade_isoDefault'};
        for (i=this.numTilesX; i<numTilesX; i++)
        {
            this.tileSprites[i] = [];
            this.tileData[i] = [];
            this.transitionSprites[i] = [];
            this.transitionData[i] = [];
            for (j=0; j<numTilesZ; j++)
            {
                this.setTile(i, j, defaultTileData);
            }
        }
        for (j=this.numTilesZ; j<numTilesZ; j++)
        {
            for (i=0; i<this.numTilesX; i++)
            {
                this.setTile(i, j, defaultTileData);
            }
        }
        for (i=this.numTilesX; i<numTilesX; i++)
        {
            this.detailSprites[i] = [];
            this.detailData[i] = [];
        }
        this.numTilesX = numTilesX;
        this.numTilesZ = numTilesZ;

        if (_drawingGrid)
        {
            this.drawGrid(true);
        }
    };

    this.setTile = function(x, z, tileData, heightOffset)
    {
        // if the tile has got a collision flag or is null, make sure there are no other objects with collisions here
        var collisionMap = wade.iso.collisionMap;
        if (!tileData || tileData.collision)
        {
            if (collisionMap[x] && collisionMap[x][z] && !collisionMap[x][z].isTerrainTile)
            {
                return false;
            }
            if (!collisionMap[x])
            {
                collisionMap[x] = [];
            }
            collisionMap[x][z] = {isTerrainTile: true, tileData: tileData};
        }
        else if (collisionMap[x] && collisionMap[x][z] && collisionMap[x][z].isTerrainTile)
        {
            collisionMap[x][z] = 0;
        }
        if (!this.tileSprites[x])
        {
            this.tileSprites[x] = [];
        }
        if (!this.tileData[x])
        {
            this.tileData[x] = [];
        }
        if (!this.tileHeight[x])
        {
            this.tileHeight[x] = [];
        }

        if (!tileData)
        {
            if (this.tileSprites[x] && this.tileSprites[x][z])
            {
                this.owner.removeSprite(this.tileSprites[x][z]);
            }
            this.tileSprites[x][z] = 0;
            if (this.transitionSprites[x] && this.transitionSprites[x][z])
            {
                this.setTransition(x, z, null);
            }
            if (this.detailSprites[x] && this.detailSprites[x][z])
            {
                this.setDetail(x, z, null);
            }
            if (this.tileHeight[x] && this.tileHeight[x][z])
            {
                this.tileHeight[x][z] = 0;
            }
        }
        else
        {
            heightOffset = heightOffset || 0;
            this.tileHeight[x][z] = heightOffset;
            var w, h, width, height, tw, th, sprite;
            var createSprite = true;
            var texture = tileData.texture;
            if (texture)
            {
                var img = wade.getImage(texture);
                tw = img.width;
                th = img.height;
            }
            if (tileData.rotation)
            {
                texture += '_iso_rot_' + tileData.rotation;
                if (wade.getLoadingStatus(texture) != 'ok')
                {
                    var spr = new Sprite(tileData.texture);
                    spr.setRotation(tileData.rotation * Math.PI / 2);
                    spr.drawToImage(texture, true);
                }
            }
            var scale = tileData.scale || 1;
            width = this.c_tileSize.x * wade.iso.getTileScaleFactor() * scale;
            height = this.c_tileSize.y * wade.iso.getTileScaleFactor() * scale;
            var baseHeight = height;
            var pos = {x: this.c_origin.x + (x - z) * this.c_tileSize.x / 2, y: this.c_origin.y - (x + z) * this.c_tileSize.y / 2};
            if (this.tileSprites[x][z])
            {
                sprite = this.tileSprites[x][z];
                if (tileData.animation || this.tileData[x][z].animation)
                {
                    this.owner.removeSprite(sprite);
                    this.tileSprites[x][z] = 0;
                }
                else
                {
                    sprite.setImageFile(texture);
                    if (tileData.imageArea)
                    {
                        sprite.setImageArea(tileData.imageArea.minX, tileData.imageArea.minY, tileData.imageArea.maxX, tileData.imageArea.maxY);
                        if (tileData.customHeight)
                        {
                            w = tileData.imageArea.maxX - tileData.imageArea.minX;
                            h = tileData.imageArea.maxY - tileData.imageArea.minY;
                            height = this.c_tileSize.x * wade.iso.getTileScaleFactor() *  h / w;
                        }
                    }
                    else if (tileData.customHeight && tw && th)
                    {
                        height = this.c_tileSize.x * wade.iso.getScaleFactor() * th / tw;
                    }
                    sprite.setSize(width, height);
                    pos.y += (height - baseHeight) / 2 - heightOffset;
                    this.owner.setSpriteOffset(this.owner.getSpriteIndex(sprite), pos);
                    createSprite = false;
                }
            }
            if (createSprite)
            {
                if (tileData.animation)
                {
                    sprite = new Sprite(0, wade.iso.getTerrainLayerId());
                    var animation = new Animation(texture, tileData.animation.numFrames.x, tileData.animation.numFrames.y, tileData.animation.speed, true);
                    sprite.addAnimation('default', animation);
                    sprite.playAnimation('default');
                }
                else
                {
                    sprite = new Sprite(texture, wade.iso.getTerrainLayerId());
                }
                sprite.customSortOrder = 0;
                sprite.customSortIndex = x + z;
                sprite.gridCoords = {x: x, z: z};
                if (tileData.imageArea)
                {
                    sprite.setImageArea(tileData.imageArea.minX, tileData.imageArea.minY, tileData.imageArea.maxX, tileData.imageArea.maxY);
                    if (tileData.customHeight)
                    {
                        w = tileData.imageArea.maxX - tileData.imageArea.minX;
                        h = tileData.imageArea.maxY - tileData.imageArea.minY;
                        height = this.c_tileSize.x * wade.iso.getTileScaleFactor() *  h / w;
                    }
                }
                else if (tileData.customHeight && tw && th)
                {
                    height = this.c_tileSize.x * wade.iso.getScaleFactor() * th / tw;
                }
                sprite.setSize(width, height);
                pos.y += (height - baseHeight) / 2 - heightOffset;
                this.tileSprites[x][z] = sprite;
                this.owner.addSprite(sprite, pos);
            }

            // adjust position of transitions, details and objects on this tile
            var topPos = {x: this.c_origin.x + (x - z) * this.c_tileSize.x / 2, y: this.c_origin.y - (x + z) * this.c_tileSize.y / 2 - heightOffset};
            if (this.transitionSprites[x] && this.transitionSprites[x][z])
            {
                this.owner.setSpriteOffset(this.owner.getSpriteIndex(this.transitionSprites[x][z]), topPos);
            }
            if (this.detailSprites[x] && this.detailSprites[x][z])
            {
                this.owner.setSpriteOffset(this.owner.getSpriteIndex(this.detailSprites[x][z]), topPos);
            }
            var objs = wade.iso.getObjectsInTile(x, z);
            for (var i=0; i<objs.length; i++)
            {
                for (var j=0; j<objs[i].getSpriteCount(); j++)
                {
                    var objBase = objs[i].getSprite(j).baseOffset;
                    objs[i].setSpriteOffset(j, {x: objBase.x, y: objBase.y - heightOffset});
                }
            }
            if (this.gridSprites[x] && this.gridSprites[x][z])
            {
                this.owner.setSpriteOffset(this.owner.getSpriteIndex(this.gridSprites[x][z]), this.getWorldCoordinates(x, z));
            }
        }
        this.tileData[x][z] = tileData;


        return true;
    };

    this.setTransition = function(x, z, data)
    {
        if (!this.transitionSprites[x])
        {
            this.transitionSprites[x] = [];
        }
        if (!this.transitionData[x])
        {
            this.transitionData[x] = [];
        }

        if (!data)
        {
            if (this.transitionSprites[x][z])
            {
                this.owner.removeSprite(this.transitionSprites[x][z]);
            }
            this.transitionSprites[x][z] = 0;
        }
        else
        {
            var createSprite = true;
            var texture = data.texture;
            if (data.rotation)
            {
                texture += '_iso_rot_' + data.rotation;
                if (wade.getLoadingStatus(texture) != 'ok')
                {
                    var spr = new Sprite(data.texture);
                    spr.setRotation(data.rotation * Math.PI / 2);
                    spr.drawToImage(texture, true);
                }
            }
            if (this.transitionSprites[x][z])
            {
                if (data.animation || this.transitionData[x][z].animation)
                {
                    this.owner.removeSprite(this.transitionSprites[x][z]);
                    this.transitionSprites[x][z] = 0;
                }
                else
                {
                    this.transitionSprites[x][z].setImageFile(texture);
                    data.imageArea && this.transitionSprites[x][z].setImageArea(data.imageArea.minX, data.imageArea.minY, data.imageArea.maxX, data.imageArea.maxY);
                    createSprite = false;
                }
            }
            var pos = {x: this.c_origin.x + (x - z) * this.c_tileSize.x / 2, y: this.c_origin.y - (x + z) * this.c_tileSize.y / 2 - this.getTileHeight(x, z)};
            if (createSprite)
            {
                var scale = data.scale || 1;
                var width = this.c_tileSize.x * wade.iso.getTileScaleFactor() * scale;
                var height = this.c_tileSize.y * wade.iso.getTileScaleFactor() * scale;
                var sprite;
                if (data.animation)
                {
                    sprite = new Sprite(0, wade.iso.getTerrainLayerId());
                    var animation = new Animation(data.texture, data.animation.numFrames.x, data.animation.numFrames.y, data.animation.speed, true);
                    sprite.addAnimation('default', animation);
                    sprite.playAnimation('default');
                }
                else
                {
                    sprite = new Sprite(texture, wade.iso.getTerrainLayerId());
                }
                sprite.setPosition(pos);
                sprite.setSize(width * wade.iso.getTileScaleFactor(), height * wade.iso.getTileScaleFactor());
                sprite.customSortOrder = 1;
                sprite.customSortIndex = x + z;
                data.imageArea && sprite.setImageArea(data.imageArea.minX, data.imageArea.minY, data.imageArea.maxX, data.imageArea.maxY);
                this.owner.addSprite(sprite);
                this.transitionSprites[x][z] = sprite;
            }
            this.owner.setSpriteOffset(this.owner.getSpriteIndex(this.transitionSprites[x][z]), pos);
        }
        this.transitionData[x][z] = data;
    };

    this.setDetail = function(x, z, data)
    {
        if (!this.detailSprites[x])
        {
            this.detailSprites[x] = [];
        }
        if (!this.detailData[x])
        {
            this.detailData[x] = [];
        }

        if (!data)
        {
            if (this.detailSprites[x][z])
            {
                this.owner.removeSprite(this.detailSprites[x][z]);
            }
            this.detailSprites[x][z] = 0;
        }
        else
        {
            var createSprite = true;
            var texture = data.texture;
            if (data.rotation)
            {
                texture += '_iso_rot_' + data.rotation;
                if (wade.getLoadingStatus(texture) != 'ok')
                {
                    var spr = new Sprite(data.texture);
                    spr.setRotation(data.rotation * Math.PI / 2);
                    spr.drawToImage(texture, true);
                }
            }
            if (this.detailSprites[x][z])
            {
                if (data.animation || this.detailData[x][z].animation)
                {
                    this.owner.removeSprite(this.transitionSprites[x][z]);
                    this.transitionSprites[x][z] = 0;
                }
                else
                {
                    this.detailSprites[x][z].setImageFile(texture);
                    data.imageArea && this.detailSprites[x][z].setImageArea(data.imageArea.minX, data.imageArea.minY, data.imageArea.maxX, data.imageArea.maxY);
                    createSprite = false;
                }
            }
            var pos = {x: this.c_origin.x + (x - z) * this.c_tileSize.x / 2, y: this.c_origin.y - (x + z) * this.c_tileSize.y / 2 - this.getTileHeight(x, z)};
            if (createSprite)
            {
                var scale = data.scale || 1;
                var width = this.c_tileSize.x * wade.iso.getTileScaleFactor() * scale;
                var height = this.c_tileSize.y * wade.iso.getTileScaleFactor() * scale;
                var sprite;
                if (data.animation)
                {
                    sprite = new Sprite(0, wade.iso.getTerrainLayerId());
                    var animation = new Animation(data.texture, data.animation.numFrames.x, data.animation.numFrames.y, data.animation.speed, true);
                    sprite.addAnimation('default', animation);
                    sprite.playAnimation('default');
                }
                else
                {
                    sprite = new Sprite(texture, wade.iso.getTerrainLayerId());
                }
                sprite.setSize(width * wade.iso.getTileScaleFactor() * scale, height * wade.iso.getTileScaleFactor() * scale);
                sprite.customSortOrder = 2;
                sprite.customSortIndex = x + z;
                data.imageArea && sprite.setImageArea(data.imageArea.minX, data.imageArea.minY, data.imageArea.maxX, data.imageArea.maxY);
                this.owner.addSprite(sprite);
                this.detailSprites[x][z] = sprite;
            }
            this.owner.setSpriteOffset(this.owner.getSpriteIndex(this.detailSprites[x][z]), pos);
        }
        this.detailData[x][z] = data;
    };

    this.getWorldCoordinates = function(tileX, tileZ)
    {
        var worldX = (tileX - tileZ) * this.c_tileSize.x / 2;
        var worldY = -(tileX + tileZ + 1) * this.c_tileSize.y / 2 - (this.tileHeight[tileX] && this.tileHeight[tileX][tileZ] || 0);

        return { x: worldX, y: worldY };
    };

    this.getFlatWorldCoordinates = function(tileX, tileZ)
    {
        var worldX = (tileX - tileZ) * this.c_tileSize.x / 2;
        var worldY = -(tileX + tileZ + 1) * this.c_tileSize.y / 2;

        return { x: worldX, y: worldY };
    };

    this.getTileCoordinates = function(worldX, worldY)
    {
        var sprites = wade.getSpritesInArea({minX: worldX, minY: worldY, maxX: worldX, maxY: worldY}, wade.iso.getTerrainLayerId(), true);
        var baseHeight = this.c_tileSize.y * wade.iso.getTileScaleFactor();
        var halfWidth = this.c_tileSize.x * wade.iso.getTileScaleFactor() / 2;
        var halfHeight = baseHeight / 2;
        var r = halfWidth * halfHeight;
        for (var i=0; i<sprites.length; i++)
        {
            var sprite = sprites[i];
            if (sprite.gridCoords)
            {
                var tileData = this.tileData[sprite.gridCoords.x][sprite.gridCoords.z];
                var spritePos = sprite.getPosition();
                var relativePos = wade.vec2.sub({x: worldX, y: worldY}, spritePos);
                if (tileData && tileData.customHeight)
                {
                    var scale = tileData.scale || 1;
                    var size = sprite.getSize();
                    if (relativePos.y + size.y / 2 > baseHeight * scale)
                    {
                        continue;
                    }
                    relativePos.y += (size.y - baseHeight) / 2;
                }
                var inside = Math.abs(relativePos.x) * halfHeight + Math.abs(relativePos.y) * halfWidth <= r;
                if (!inside)
                {
                    continue;
                }
                return {x: sprite.gridCoords.x, z: sprite.gridCoords.z, valid: true};
            }
        }
        var tileX =   (worldX) / this.c_tileSize.x - (worldY) / this.c_tileSize.y;
        var tileZ = -((worldX) / this.c_tileSize.x + (worldY) / this.c_tileSize.y);
        tileX = Math.floor(tileX);
        tileZ = Math.floor(tileZ);
        return {x: tileX, z: tileZ, valid: (tileX >=0 && tileZ >= 0 && tileX < this.numTilesX && tileZ < this.numTilesZ)};
    };

    this.getFlatTileCoordinates = function(worldX, worldY)
    {
        var tileX =   (worldX) / this.c_tileSize.x - (worldY) / this.c_tileSize.y;
        var tileZ = -((worldX) / this.c_tileSize.x + (worldY) / this.c_tileSize.y);
        tileX = Math.floor(tileX);
        tileZ = Math.floor(tileZ);
        var valid = (tileX >=0 && tileZ >= 0 && tileX < this.numTilesX && tileZ < this.numTilesZ);
        return {x: tileX, z: tileZ, valid: valid};
    };

    this.onMouseDown = function(eventData)
    {
        if (wade.app.onIsoTerrainMouseDown)
        {
            var tileCoords = this.getTileCoordinates(eventData.position.x, eventData.position.y);
            if (tileCoords.valid)
            {
                var worldCoords = this.getWorldCoordinates(tileCoords.x, tileCoords.z);
                return wade.app.onIsoTerrainMouseDown({gridCoords: tileCoords, worldCoords: worldCoords});
            }
        }
        return false;
    };

    this.onClick = function(eventData)
    {
        if (wade.app.onIsoTerrainClick)
        {
            var tileCoords = this.getTileCoordinates(eventData.position.x, eventData.position.y);
            if (tileCoords.valid)
            {
                var worldCoords = this.getWorldCoordinates(tileCoords.x, tileCoords.z);
                return wade.app.onIsoTerrainClick({gridCoords: tileCoords, worldCoords: worldCoords});
            }
        }
        return false;
    };

    this.onMouseUp = function(eventData)
    {
        if (wade.app.onIsoTerrainMouseUp)
        {
            var tileCoords = this.getTileCoordinates(eventData.position.x, eventData.position.y);
            if (tileCoords.valid)
            {
                var worldCoords = this.getWorldCoordinates(tileCoords.x, tileCoords.z);
                return wade.app.onIsoTerrainMouseUp({gridCoords: tileCoords, worldCoords: worldCoords});
            }
        }
        return false;
    };

    this.setHighlight = function(texture, offsets)
    {

        var i;
        this.highlightOffsets = offsets || [{x:0, z:0}];

        if (texture instanceof(Sprite))
        {
            if (this.highlightTexture)
            {
                for (i=0; i<this.tileHighlightObjects.length; i++)
                {
                    wade.removeSceneObject(this.tileHighlightObjects[i]);
                    this.tileHighlightObjects[i] = null;
                }
            }
            this.highlightSprite = texture;
            this.highlightTexture = null;
        }
        else
        {
            if (this.highlightSprite)
            {
                for (i=0; i<this.tileHighlightObjects.length; i++)
                {
                    wade.removeSceneObject(this.tileHighlightObjects[i]);
                }
                this.tileHighlightObjects.length = 0;
            }
            this.highlightTexture = texture;
            this.highlightSprite = null;
        }
        if (this.highlightTexture && this.highlightOffsets && this.highlightOffsets.length)
        {
            for (i=0; i<this.tileHighlightObjects.length; i++)
            {
                this.getTileHighlightObject(i).getSprite(0).setImageFile(texture);
            }
        }
        else if (this.highlightSprite)
        {
            for (i=0; i<this.tileHighlightObjects.length; i++)
            {
                this.getTileHighlightObject(i);
            }
        }
        else
        {
            this.hideTileHighlightObjects();
        }
    };

    this.onMouseMove = function(eventData)
    {
        var tileCoords, worldCoords;
        tileCoords = this.getTileCoordinates(eventData.position.x, eventData.position.y);
        if (tileCoords.valid && (this.highlightTexture || this.highlightSprite) && this.highlightOffsets && this.highlightOffsets.length)
        {
            for (var i=0; i<this.highlightOffsets.length; i++)
            {
                var gridOffset = this.highlightOffsets[i];
                worldCoords = this.getWorldCoordinates(tileCoords.x + gridOffset.x, tileCoords.z + gridOffset.z);
                var highlightObject = this.getTileHighlightObject(i);
                highlightObject.setPosition(worldCoords);
                highlightObject.setVisible(true);
                highlightObject.iso.gridCoords.x = tileCoords.x + gridOffset.x;
                highlightObject.iso.gridCoords.z = tileCoords.z + gridOffset.z;
            }
        }
        else
        {
            this.hideTileHighlightObjects();
        }
        wade.app.onIsoTerrainMouseMove && wade.app.onIsoTerrainMouseMove(wade.extend({}, eventData, {gridCoords: tileCoords}));
    };

    this.sort = function()
    {
        wade.getLayer(wade.iso.getTerrainLayerId()).sort(this.sortingFunction);
    };

    this.drawGrid = function(toggle)
    {
        var i, j;
        var terrainLayerId = wade.iso.getTerrainLayerId();
        if (toggle && !drawingGrid)
        {
            for (i=0; i<this.numTilesX; i++)
            {
                this.gridSprites[i] = [];
                for (j=0; j<this.numTilesZ; j++)
                {
                    var sprite = new Sprite('_wade_isoGrid', terrainLayerId);
                    sprite.customSortOrder = 3;
                    sprite.customSortIndex = i + j;
                    var pos = {x: this.c_origin.x + (i - j) * this.c_tileSize.x / 2, y: this.c_origin.y - (i + j) * this.c_tileSize.y / 2 - (this.tileHeight[i] && this.tileHeight[i][j] || 0)};
                    sprite.setSize(this.c_tileSize.x * wade.iso.getTileScaleFactor(), this.c_tileSize.y * wade.iso.getTileScaleFactor());
                    this.owner.addSprite(sprite, pos);
                    this.gridSprites[i][j] = sprite;
                }
            }
            drawingGrid = true;
        }
        else if (!toggle && drawingGrid)
        {
            for (i=0; i<this.numTilesX; i++)
            {
                for (j=0; j<this.numTilesZ; j++)
                {
                    this.owner.removeSprite(this.gridSprites[i][j])
                }
            }
            this.gridSprites.length = 0;
            drawingGrid = false;
        }
    };

    this.getTileTexture = function(x, z)
    {
        return (this.tileSprites[x] && this.tileSprites[x][z] && this.tileSprites[x][z].getImageName());
    };

    this.getTileData = function(x, z)
    {
        return this.tileData[x] && this.tileData[x][z] && wade.cloneObject(this.tileData[x][z]);
    };

    this.getTransitionData = function(x, z)
    {
        return this.transitionData[x] && this.transitionData[x][z] && wade.cloneObject(this.transitionData[x][z]);
    };

    this.getDetailData = function(x, z)
    {
        return this.detailData[x] && this.detailData[x][z] && wade.cloneObject(this.detailData[x][z]);
    };

    this.setTileHeight = function(x, z, height)
    {
        this.setTile(x, z, (this.tileData[x] && this.tileData[x][z]), height);
    };

    this.getTileHeight = function(x, z)
    {
        return this.tileHeight[x] && this.tileHeight[x][z] || 0;
    };
}
