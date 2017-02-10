/**
 * This is a behavior to be used by characters in the isometric world of wade.iso. It handles movement, pathfinding, movement queues, and more.
 * @constructor
 */
function IsoCharacter()
{
    var self = this;
    var destinations = [];
    var wandering;
    var variationDirection = 'forward';
    var targetObject;
    var movementType;

    /**
     * The name of the behavior. This is set to 'IsoCharacter'.
     * @type {string}
     */
    this.name = 'IsoCharacter';

    /**
     * The movement speed of the character (in world units per second). Note that changing this won't affect any movement that is currently in progress, only future movements. Default is 160.
     * @type {number}
     */
    this.movementSpeed = 160;

    /**
     * The maximum height difference between two tiles that will allow this character to move from one tile to the next. Default is 20.
     * @type {number}
     */
    this.maxStepHeight = 20;

    /**
     * How likely it is that an idle animation (if present) will be played when the character is idle
     * @type {number}
     */
    this.variationProbability = 0.1;

    /**
     * Set a destination (a tile to move to) for the character.
     * @param {{x: number, z: number}} gridCoords The isometric tile coordinates to move to
     * @returns {boolean} Whether it was possible to add the destination (i.e. it isn't blocked by objects with collisions)
     */
    this.setDestination = function(gridCoords)
    {
        var currentPosition = this.owner.getPosition();
        var gridStart = wade.iso.getFlatTileCoordinates(currentPosition.x, currentPosition.y);
        var destination = this.getNextDestination();

        // if we already had a destination
        if (destination)
        {
            // start from the next grid tile
            var deltaX = destination.x - gridStart.x;
            if (deltaX)
            {
                deltaX /= Math.abs(deltaX);
            }
            var deltaZ = destination.z - gridStart.z;
            if (deltaZ)
            {
                deltaZ /= Math.abs(deltaZ);
            }
            gridStart.x += deltaX;
            gridStart.z += deltaZ;
        }

        // calculate path to destination
        var path = wade.iso.findPath(gridStart, gridCoords, movementType, this.maxStepHeight);

        // if there is a path
        if (path.length)
        {
            // add the first node
            var worldStart = wade.iso.getFlatWorldCoordinates(gridStart.x, gridStart.z);
            this.clearDestinations();
            if (Math.abs(currentPosition.x - worldStart.x) > wade.c_epsilon || Math.abs(currentPosition.y - worldStart.z) > wade.c_epsilon)
            {
                if (destination.x == gridCoords.x && destination.z == gridCoords.z)
                {
                    return false;
                }
                addDirectDestination(gridStart);
                this._goToNextDestination();
            }
            if (gridStart.x == gridCoords.x && gridStart.z == gridCoords.z)
            {
                return false;
            }
            // iterate over the rest of the path
            for (var i=1; i<path.length-1; i++)
            {
                var previousX = path[i].x - path[i-1].x;
                var nextX = path[i+1].x - path[i].x;
                var previousZ = path[i].z - path[i-1].z;
                var nextZ = path[i+1].z - path[i].z;
                if (previousX != nextX || previousZ != nextZ)
                {
                    addDirectDestination(path[i]);
                }
            }
            // add last node
            addDirectDestination(gridCoords);
            return true;
        }
        return false;
    };

    /**
     * Remove any destinations that were added with setDestination()
     */
    this.clearDestinations = function()
    {
        destinations.length = 0;
    };

    /**
     * Set a movement type for this character.
     * @param {string} type A string describing the movement type. It can be 'diagonal', 'straight' or 'both'. If omitted, the character will use the default movement type (the one that was set with wade.iso.init(), or, if it wasn't set, 'diagonal').
     */
    this.setMovementType = function(type)
    {
        movementType = type;
    };

    /**
     * Get the next destination
     * @returns {Object} An object with x and z fields representing the next destination, or null if there are no destinations in the queue
     */
    this.getNextDestination = function()
    {
        return this._nextDestination;
    };

    /**
     * Set a direction to face. This will change the idle animation that is currently playing, and won't have any effect if the character is moving.
     * @param {string} direction The direction to face. It can be one of ['n', 'e', 's', 'w'] (if you have set the isometric movement type to 'straight'), one of ['ne', 'nw', 'se', 'sw'] (if you have set the isometric movement type to 'diagonal', which is the default), or any one of either set (if you have the isometric movement type ot 'both')
     */
    this.setDirection = function(direction)
    {
        if (!this.owner.isMoving())
        {
            this.owner.playAnimation('Idle_iso_' + direction);
        }
    };

    /**
     * Move towards an object. If the object has an <i>interactionOffset</i> field set in its object data, the character will try to go there. If that is not possible (or no interaction offset is set) the character will try to move to the object's tile. If that is not possible (because the object has a collision map), it will try to move to any tile next to the object
     * @param {SceneObject|string} object An object (or a string with the name of the object) to move towards.
     */
    this.goToObject = function(object)
    {
        if (typeof(object) == 'string')
        {
            object = wade.getSceneObject(object);
            if (!object)
            {
                return;
            }
        }

        var currentCoords = this.owner.iso.gridCoords;

        // get a list of possible targets
        var targetCoords = [];
        var interactionOffset = object.iso.objectData.interactionOffset;
        if (interactionOffset)
        {
            targetCoords.push({x: object.iso.gridCoords.x + interactionOffset.x, z: object.iso.gridCoords.z + interactionOffset.z, object: object});
        }
        targetCoords.push({x: object.iso.gridCoords.x, z: object.iso.gridCoords.z, object: object});
        var movementOffsets = wade.iso.getValidMovementDirections();

        var offsetCoords = [];
        for (var i=0; i<movementOffsets.length; i++)
        {
            offsetCoords.push({x: object.iso.gridCoords.x + movementOffsets[i].x, z: object.iso.gridCoords.z + movementOffsets[i].z, object: object});
        }
        offsetCoords.sort(function(a, b)
        {
            var dx, dz;
            dx = currentCoords.x - a.x;
            dz = currentCoords.z - a.z;
            var distA = dx*dx + dz*dz;
            dx = currentCoords.x - b.x;
            dz = currentCoords.z - b.z;
            var distB = dx*dx + dz*dz;
            return distA - distB;
        });
        for (i=0; i<offsetCoords.length; i++)
        {
            targetCoords.push(offsetCoords[i]);
        }

        for (i=0; i<targetCoords.length; i++)
        {
            if (targetCoords[i].x != currentCoords.x || targetCoords[i].z != currentCoords.z)
            {
                if (this.setDestination(targetCoords[i]))
                {
                    break;
                }
            }
            else
            {
                targetObject = object;
                this.owner.processEvent('onMoveComplete');
                break;
            }
        }
    };

    /**
     * Start moving around in random directions
     * @param {number} probability A number between 0 and 1 indicating the movement probability. Lower numbers will make the character move less often.
     * @param {number} stepDistance The maximum number of tiles that each movement can span
     * @param {SceneObject|string} [targetObject] An isometric object (or its name as a string) that the character will try to keep close to while wandering.
     */
    this.startWandering = function(probability, stepDistance, targetObject)
    {
        wandering = {probability: probability, stepDistance: stepDistance, targetObject: targetObject};
    };

    /**
     * Stop moving around in random directions
     */
    this.stopWandering = function()
    {
        wandering = 0;
    };

    this.onMoveComplete = function()
    {
        // if there are more destination in the queue, proceed to the next one
        if (destinations.length)
        {
            this._goToNextDestination();
        }
        else
        {
            // enter an idle state
            this.owner.playAnimation('Idle_iso_' + this.lastDirection);
            this.lastDirection = '';

            // fire an onDestinationReached event
            var dest = this._nextDestination;
            this._nextDestination = null;
            this.owner.processEvent('onDestinationReached', {destination: dest});

            // see if we've reached any objects
            if (targetObject)
            {
                var offsets = [{x:0, z:0}];
                targetObject.interactionOffset && offsets.push({x:-targetObject.interactionOffset.x, z:-targetObject.interactionOffset.z});
                offsets = offsets.concat(wade.iso.getValidMovementDirections());
                for (var j=0; j<offsets.length; j++)
                {
                    var objects = wade.iso.getObjectsInTile(this.owner.iso.gridCoords.x + offsets[j].x, this.owner.iso.gridCoords.z + offsets[j].z);
                    for (var i=0; i<objects.length; i++)
                    {
                        if (objects[i] == targetObject)
                        {
                            var directions = {'01': 'se', '11': 's', '10': 'sw', '1-1': 'w', '0-1': 'nw', '-1-1':'n', '-10': 'ne', '-11': 'e'};
                            var diff = {x: this.owner.iso.gridCoords.x - targetObject.iso.gridCoords.x, z: this.owner.iso.gridCoords.z - targetObject.iso.gridCoords.z};
                            var dir = directions[diff.x.toString() + diff.z.toString()];
                            dir && this.setDirection(dir);
                            this.owner.processEvent('onObjectReached', {object: objects[i]});
                        }
                    }
                }
            }
        }
    };

    this.onAddToScene = function()
    {
        wade.addEventListener(this.owner, 'onAppTimer');
    };

    this.onAppTimer = function()
    {
        if (wandering)
        {
            if (Math.random() < wandering.probability)
            {
                this._wander();
            }
        }
        if (Math.random() < this.variationProbability)
        {
            var sprite = this.owner.getSprite(0);
            var anim = sprite.getCurrentAnimationName();
            var pos = anim.indexOf('_variation_');
            if (pos >= 0)
            {
                anim = anim.substr(0, pos);
            }

            for (var numVariations=0; sprite.hasAnimation(anim + '_variation_' + numVariations); numVariations++) {}
            if (numVariations && !sprite.getCurrentAnimation().isPlaying())
            {
                if (pos && variationDirection == 'reverse')
                {
                    anim = sprite.getCurrentAnimationName();
                }
                else
                {
                    anim += '_variation_' + Math.floor(Math.random() * numVariations);
                    variationDirection = 'forward';
                }
                this.owner.playAnimation(anim, variationDirection);
                variationDirection = (variationDirection == 'forward')? 'reverse' : 'forward';
            }
        }
    };

    this._wander = function()
    {
        // if we're already moving, return
        if (destinations.length)
        {
            return;
        }

        // choose a random position nearby
        var destination = {x: this.owner.iso.gridCoords.x, z: this.owner.iso.gridCoords.z};
        var dx = Math.round(Math.random() * wandering.stepDistance * 2 - wandering.stepDistance);
        var dz = Math.round(Math.random() * wandering.stepDistance * 2 - wandering.stepDistance);

        //  if we have a target object, try to go towards it once in a while
        if (wandering && wandering.targetObject)
        {
            var targetObject = (typeof(wandering.targetObject) == 'string') ? wade.getSceneObject(wandering.targetObject) : wandering.targetObject;
            if (targetObject)
            {
                if (Math.random() < 0.5)
                {
                    if ((targetObject.gridCoords.x - destination.x) * dx < 0)
                    {
                        dx *= -1;
                    }
                }
                if (Math.random() < 0.5)
                {
                    if ((targetObject.gridCoords.z - destination.z) * dz < 0)
                    {
                        dz *= -1;
                    }
                }
            }
        }
        if (dx || dz)
        {
            // go there only if there are no objects
            destination.x += dx;
            destination.z += dz;
            if (!wade.iso.checkCollisionsAtTile(destination.x, destination.z))
            {
                if (!this.setDestination(destination))
                {
                    destination.x -= dx;
                    if (!this.setDestination(destination))
                    {
                        destination.z -= dz;
                        destination.x += dx;
                        this.setDestination(destination);
                    }
                }
            }
        }
    };

    this._goToNextDestination = function()
    {
        // reset collision info for our tile
        var currentGridCoords = this.owner.iso.gridCoords;
        var gridCoords = destinations[0];
        this._nextDestination = destinations[0];
        targetObject = destinations[0].object;
        wade.removeObjectFromArrayByIndex(0, destinations);
        wade.iso.moveObjectToTile(this.owner, gridCoords.x, gridCoords.z, this.movementSpeed);

        // find direction suffix (for the animation)
        var dirX = (gridCoords.x - currentGridCoords.x);
        var dirZ = (gridCoords.z - currentGridCoords.z);
        dirX && (dirX /= Math.abs(dirX));
        dirZ && (dirZ /= Math.abs(dirZ));
        var direction;
        switch (dirX.toString() + dirZ)
        {
            case '-1-1':
                direction = 's';
                break;
            case '-10':
                direction = 'sw';
                break;
            case '-11':
                direction = 'w';
                break;
            case '0-1':
                direction = 'se';
                break;
            case '01':
                direction = 'nw';
                break;
            case '1-1':
                direction = 'e';
                break;
            case '10':
                direction = 'ne';
                break;
            case '11':
                direction = 'n';
                break;
        }

        if (direction != this.lastDirection)
        {
            this.lastDirection = direction;
            this.owner.playAnimation('Walk_iso_' + this.lastDirection);
        }
    };

    var addDirectDestination = function(gridCoords)
    {
        destinations.push(gridCoords);
        if (!self.owner.isMoving())
        {
            self._goToNextDestination();
        }
    };
}
