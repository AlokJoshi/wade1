function SceneManager()
{
	var sceneObjects = [];
    var paths = [];
	var eventListeners = {onMouseDown: [], onMouseUp: [], onMouseMove: [], onMouseWheel: [], onClick: [], onMouseIn: [], onMouseOut: [], onKeyDown: [], onKeyUp: [], onKeyPress: [], onAppTimer: [], onSimulationStep: [], onUpdate: [], onResize: [], onContainerResize: [], onDeviceMotion: [], onDeviceOrientation: [], onSwipeLeft: [], onSwipeRight: [], onSwipeUp: [], onSwipeDown: [], onBlur: [], onFocus: [], onOverlap: []};
	var globalEventListeners = wade.cloneObject(eventListeners);
	var appTime = 0;
    var simulationDirtyState = false;
    var namedObjects = {};
    var overlapStatus = {};
    var unnamedObjectCount = 0;

	this.init = function()
	{
		// create and initialise the renderer
		this.renderer = new Renderer();
		this.renderer.init(this);

        // expose named objects through the global _ symbol
        if (wade.isUsingGlobalUnderscore())
        {
            _ = namedObjects;
        }
	};

    this.addSceneObject = function(sceneObject, autoListen, params)
    {
        // add the scene object to the array of scene objects
        sceneObjects.push(sceneObject);
        sceneObject.autoListen = autoListen;
        sceneObject.addToSceneParams = params? wade.extend(true, {}, params) : null;

        // add its sprites to the renderer
        sceneObject.addSpritesToRenderer(this.renderer);

        // add the object to our list of named objects - if it doesn't have a name, it will be assigned one
        this.addNamedObject(sceneObject);

        // if autoListen is true, look for any event handlers that have been defined for this object and its behaviors, then register it as an event listener for the handled events
        if (autoListen && !sceneObject.isTemplate())
        {
            for (var e in eventListeners)
            {
                if (eventListeners.hasOwnProperty(e))
                {
                    var listen = (sceneObject[e]);
                    if (!listen)
                    {
                        var behaviors = sceneObject.getBehaviors();
                        for (var i=0; i<behaviors.length && !listen; i++)
                        {
                            listen = behaviors[i][e];
                        }
                    }
                    if (listen)
                    {
                        wade.addEventListener(sceneObject, e);
                    }
                }
            }
        }

        // if it's a template, make it invisible
        if (sceneObject.isTemplate())
        {
            var spriteCount = sceneObject.getSpriteCount();
            for (i=0; i<spriteCount; i++)
            {
                sceneObject.getSprite(i).setVisible(false);
            }
        }

        // fire an 'onAddToScene' event
        sceneObject.processEvent('onAddToScene', params);

        // start the simulation of this object if needed
        if (!sceneObject.simulated && sceneObject.needsSimulation())
        {
            wade.simulateSceneObject(sceneObject, true);
        }
    };

    this.addPath = function(path)
    {
        paths.push(path);
        this.addNamedObject(path);
        path.onAddToScene();
    };

    this.addNamedObject = function(namedObject)
    {
        var name = namedObject.getName();
        if (!name)
        {
            name = '__wade_unnamed_sceneObject_' + unnamedObjectCount++;
            namedObject.setName(name);
        }
        else
        {
            if (namedObjects[name])
            {
                wade.warn('Warning: an object named ' + name + ' is already present in the scene. Duplicate names can cause unexpected behavior.');
            }
            else
            {
                namedObjects[name] = namedObject;
            }
        }
    };

    this.removeNamedObject = function(name)
    {
        if (name)
        {
            delete namedObjects[name];
        }
    };

    this.changeObjectName = function(sceneObject, oldName)
    {
        this.removeNamedObject(oldName);
        this.addNamedObject(sceneObject);
    };

    this.getObjectByName = function(name)
    {
        return namedObjects[name];
    };

    this.getObjects = function(property, value, objectArray)
    {
        if (property)
        {
            var result = [];
            var i;
            if (typeof(value) == 'undefined')
            {
                for (i=0; i<objectArray.length; i++)
                {
                    (typeof(objectArray[i][property]) != 'undefined') && result.push(objectArray[i]);
                }
            }
            else
            {
                for (i=0; i<objectArray.length; i++)
                {
                    (objectArray[i][property] == value) && result.push(objectArray[i]);
                }
            }
            return result;
        }
        else
        {
            return wade.cloneArray(objectArray);
        }
    };

    this.getSceneObjects = function(property, value)
    {
        return this.getObjects(property, value, sceneObjects);
    };

    this.getPaths = function(property, value)
    {
        return this.getObjects(property, value, paths);
    };

	this.removeEventListener = function(sceneObject, event)
	{
        wade.removeObjectFromArray(sceneObject, eventListeners[event]);
	};

	this.removeGlobalEventListener = function(sceneObject, event)
	{
        wade.removeObjectFromArray(sceneObject, globalEventListeners[event]);
	};
	
	this.removeSceneObject = function(sceneObject)
	{
        if (!sceneObject)
        {
            return;
        }

        // fire the 'onRemoveFromScene' event for the sceneObject
        sceneObject.processEvent('onRemoveFromScene');

		// remove it from the list of scene objects
        wade.removeObjectFromArray(sceneObject, sceneObjects);

        // remove it from the list of named objects
        var name = sceneObject.getName();
        name && this.removeNamedObject(name);

		// remove it from the event listeners
        for (var e in eventListeners)
        {
            if (eventListeners.hasOwnProperty(e))
            {
                eventListeners[e].length && this.removeEventListener(sceneObject, e);
                globalEventListeners[e].length && this.removeGlobalEventListener(sceneObject, e);
            }
        }

        // remove its sprites from the renderer
        sceneObject.removeSpritesFromRenderer();
	};

    this.removePath = function(path)
    {
        if (!path)
        {
            return;
        }

        // remove it from the list of paths
        wade.removeObjectFromArray(path, paths);

        // remove it from the list of named objects
        var name = path.getName();
        name && this.removeNamedObject(name);

		// tell the path so it can update its status
		path.onRemoveFromScene();
    };

    this.clear = function()
    {
        for (var i=sceneObjects.length-1; i>=0; i--)
        {
            this.removeSceneObject(sceneObjects[i]);
        }
        for (i=paths.length-1; i>=0; i--)
        {
            this.removePath(paths[i]);
        }
    };

	this.step = function()
	{
        var printProfileStats = wade.logSimulationTime && console['time'] && console['timeEnd'] && Math.random() < 0.02;
        if (printProfileStats)
        {
            console['time']("Simulation");
        }
        // iterate over the scene objects that need to be simulated
        var objects = eventListeners['onSimulationStep'];
        for (var i=0; i<objects.length; i++)
        {
            var sceneObject = objects[i];
            sceneObject.step();
        }
		// update app timer
		appTime += wade.c_timeStep;

        // fire an onUpdate event
        this.processEvent('onUpdate');

        // check for overlaps
        var overlapListeners = eventListeners['onOverlap'];
        for (i=0; i<overlapListeners.length; i++)
        {
            if (!overlapListeners[i].isInScene())
            {
                continue;
            }
            var overlapping = overlapListeners[i].getOverlappingObjects();
            var name = overlapListeners[i].getName();
            var newOverlapStatus = {};
            if (!overlapStatus[name])
            {
                overlapStatus[name] = {};
            }
            for (var j=0; j<overlapping.length; j++)
            {
                var overlappingName = overlapping[j].getName();
                if (!overlapStatus[name][overlappingName])
                {
                    overlapListeners[i].processEvent('onOverlap', {otherObject: overlapping[j]});
                }
                newOverlapStatus[overlappingName] = true;
            }
            overlapStatus[name] = newOverlapStatus;
        }

        if (printProfileStats)
        {
            console['timeEnd']("Simulation");
        }

        // update the dirty state (so the renderer knows that something has changed and it may need drawing)
        simulationDirtyState = true;
    };
	
	this.addEventListener = function(sceneObject, event)
	{
        (!eventListeners[event]) && (eventListeners[event] = []);
        (!globalEventListeners[event]) && (globalEventListeners[event] = []);
        (eventListeners[event].indexOf(sceneObject) == -1) && eventListeners[event].push(sceneObject);
	};

	this.addGlobalEventListener = function(sceneObject, event)
	{
        (!eventListeners[event]) && (eventListeners[event] = []);
        (!globalEventListeners[event]) && (globalEventListeners[event] = []);
        (globalEventListeners[event].indexOf(sceneObject) == -1) && globalEventListeners[event].push(sceneObject);
	};

	this.getEventListeners = function(event, eventData)
	{
        var results = [];
        var i, sceneObject;
        switch (event)
        {
            case 'onMouseDown':
            case 'onMouseUp':
            case 'onMouseMove':
            case 'onMouseWheel':
            case 'onClick':
            case 'onMouseIn':
            case 'onMouseOut':
            case 'onSwipeLeft':
            case 'onSwipeRight':
            case 'onSwipeUp':
            case 'onSwipeDown':
                var screenPosition = {x: eventData.screenPosition.x, y: eventData.screenPosition.y};
                for (i=eventListeners[event].length-1; i>=0; i--)
                {
                    sceneObject = eventListeners[event][i];
                    var spriteAtPos = sceneObject.getSpriteAtPosition(screenPosition);
                    if (spriteAtPos.isPresent)
                    {
                        sceneObject.eventResponse =
                        {
                            spriteIndex: spriteAtPos.spriteIndex,
                            position: spriteAtPos.relativeWorldPosition,
                            screenPosition: screenPosition,
                            topLayer: spriteAtPos.topLayer,
                            button: eventData.button,
                            value: eventData.value
                        };
                        results.push(sceneObject);
                    }
                }
                results.sort(this.eventListenersSorter);
                break;
            default:
                for (i=eventListeners[event].length-1; i>=0; i--)
                {
                    sceneObject = eventListeners[event][i];
                    sceneObject.eventResponse = eventData;
                    results.push(sceneObject);
                }
        }
        return results;
    };
	
	this.eventListenersSorter = function(a, b)
	{
		return ((a.eventResponse.topLayer - b.eventResponse.topLayer) || -wade.getLayer(a.eventResponse.topLayer).compareSprites(a.getSprite(a.eventResponse.spriteIndex), b.getSprite(b.eventResponse.spriteIndex)));
	};

    this.isObjectListeneningForEvent = function(object, eventName)
    {
        var listeners = eventListeners[eventName];
        return !!(listeners && listeners.indexOf(object) >= 0);
    };
	
	this.onResize = function(oldWidth, oldHeight, newWidth, newHeight)
	{
		for (var i = 0; i < sceneObjects.length; i++)
		{
			var sceneObject = sceneObjects[i];
            var pos = sceneObject.getPosition();
            var alignment = sceneObject.getAlignment();
            var deltaX = 0;
            var deltaY = 0;
			switch (alignment.x)
			{
				case 'right':
                    deltaX = (newWidth - oldWidth) / 2;
					break;
				case 'left':
                    deltaX = -(newWidth - oldWidth) / 2;
					break;
			}
			switch (alignment.y)
			{
				case 'top':
					deltaY = -(newHeight - oldHeight) / 2;
					break;
				case 'bottom':
					deltaY = (newHeight - oldHeight) / 2;
					break;
			}
            sceneObject.setPosition(pos.x + deltaX, pos.y + deltaY);
            if (sceneObject.isMoving() && (deltaX || deltaY))
            {
                var targetPosition = sceneObject.getTargetPosition();
                targetPosition && sceneObject.moveTo(targetPosition.x + deltaX, targetPosition.y +  deltaY, sceneObject.getMovementSpeed());
            }
		}
        var eventData = {width: newWidth, height: newHeight};
        if (!this.processEvent('onResize', eventData))
        {
            wade.app.onResize && wade.app.onResize(eventData);
        }
	};
	
	this.processEvent = function(event, eventData)
	{
		var listeners = this.getEventListeners(event, eventData);
        var result = false;
		for (var i=0; i<listeners.length; i++)
		{
            var sceneObject = listeners[i];
            if (sceneObject.processEvent(event, sceneObject.eventResponse))
            {
                result = true;
                break;
            }
		}
        var globalEventData = (eventData && wade.cloneObject(eventData)) || {};
        globalEventData.global = true;
        for (i=0; i<globalEventListeners[event].length; i++)
        {
            globalEventListeners[event][i].processEvent(event, globalEventData);
        }
		return result;
	};
	
	this.appTimerEvent = function()
	{
		// pass the event to all the scene objects that are listening for it
		for (var i=0; i<eventListeners['onAppTimer'].length; i++)
		{
			var sceneObject = eventListeners['onAppTimer'][i];
            sceneObject.processEvent('onAppTimer');
		}
        wade.app && wade.app.onAppTimer && wade.app.onAppTimer();
	};

    this.updateMouseInOut = function(oldPosition, newPosition)
    {
        // see if we have to fire an onMouseOut event for objects that are listening for it
        var i, sceneObject;
        var validOldPosition = (typeof(oldPosition.x) != 'undefined');
        if (validOldPosition)
        {
            var outListeners = this.getEventListeners('onMouseOut', {screenPosition: oldPosition});
            for (i=0; i<outListeners.length; i++)
            {
                sceneObject = outListeners[i];
                if (!sceneObject.getSpriteAtPosition(newPosition).isPresent && sceneObject.processEvent('onMouseOut', sceneObject.eventResponse))
                {
                    break;
                }
            }
        }
        // see if we have to fire an onMouseIn event for objects that are listening for it
        var inListeners = this.getEventListeners('onMouseIn', {screenPosition: newPosition});
        for (i=0; i<inListeners.length; i++)
        {
            sceneObject = inListeners[i];
            if (!(validOldPosition && sceneObject.getSpriteAtPosition(oldPosition).isPresent) && sceneObject.processEvent('onMouseIn', sceneObject.eventResponse))
            {
                break;
            }
        }
    };

    this.getAppTime = function()
    {
        return appTime;
    };

    this.getSimulationDirtyState = function()
    {
        return simulationDirtyState;
    };

    this.clearSimulationDirtyState = function()
    {
        simulationDirtyState = false;
    };

    this.setSimulationDirtyState = function()
    {
        simulationDirtyState = true;
    };

    this.draw = function(layerIds)
    {
        this.renderer.draw(layerIds);
    };

    this.exportSceneObjects = function(exclude, exportObjectFunctions)
    {
        var exported = [];
        for (var i=0; i<sceneObjects.length; i++)
        {
            if (exclude && (exclude.indexOf(sceneObjects[i]) != -1 || (sceneObjects[i].getName() && exclude.indexOf(sceneObjects[i].getName()) != -1)) || sceneObjects[i].noExport)
            {
                continue;
            }
            exported.push(sceneObjects[i].serialize(false, null, exportObjectFunctions));
        }
        return exported;
    };

	this.exportPaths = function(exclude)
	{
		var exported = [];
		for (var i=0; i<paths.length; i++)
		{
			if (exclude && (exclude.indexOf(paths[i]) != -1 || (paths[i].getName() && exclude.indexOf(paths[i].getName()) != -1)))
			{
				continue;
			}
			exported.push(paths[i].serialize(false));
		}
		return exported;
	};

    this.getSceneObjectIndex = function(sceneObject)
    {
        return sceneObjects.indexOf(sceneObject);
    };

    this.getPathIndex = function(path)
    {
        return paths.indexOf(path);
    };

    this.setObjectIndex = function(obj, index, objectArray)
    {
        var currentIndex = objectArray.indexOf(obj);
        if (currentIndex != -1 && index != currentIndex)
        {
            wade.removeObjectFromArrayByIndex(currentIndex, objectArray);
            if (objectArray.length > index)
            {
                objectArray.splice(index, 0, obj);
                return index;
            }
            return objectArray.push(obj) - 1;
        }
        return -1;
    };

    this.setSceneObjectIndex = function(sceneObject, index)
    {
        return this.setObjectIndex(sceneObject, index, sceneObjects);
    };

    this.setPathIndex = function(path, index)
    {
        return this.setObjectIndex(path, index, paths);
    };
}
