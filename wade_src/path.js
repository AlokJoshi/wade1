/**
 * A Path is a collection of nodes that a scene object can be told to follow.
 * Any values between nodes (not just position but opacity, size, rotation and any custom properties) are interpolated using a method that you can change per node.
 * When a SceneObject is on a Path segment, any properties that are present on both the start and end node of that segment are interpolated and applied to the object and all of its sprites.
 * @param {Array|object} [nodes] An array of nodes (see <i>setNode</i> for a definition of the data structure of each node). You can also use this constructor by passing in a single object (so just the first parameter) that contains all the Path properties that you want to set (see remarks below for more details).
 * @param {string} [name] The name of the path. This can be used to refer to the path using <i>wade.getPath(pathName)</i>.
 * <br/><br/><b>Remarks:</b><br/> You can also use this constructor by passing in a single object (so just the first parameter) that contains all the Path properties that you want to set. In this case, the object structure is as follows (all fields are optional): <br/><pre>
 {
 	type: 'Path',
 	nodes: Array,
 	name: string
 }
 * @constructor
 */
function Path(nodes, name)
{
    this._inScene = false;

    // do we have an object-style constructor?
    if (!wade.isArray(nodes))
    {
        var c = nodes;
        this._nodes = c && c.nodes || [];
        this._name = c && c.name || '';
    }
    else
    {
        this._nodes = nodes;
        this._name = name;
    }
    this._nodes = this._nodes || [];
    if (!this._nodes.length)
    {
        this._nodes[0] = {duration: 0, tweenType: 'no easing'};
    }
    this._name = this._name || '';
}

/**
 * Set an array of nodes that this path will use. See <i>setNode</i> for a definition of the data structure to use for each node.
 * @param {Array} nodes The array of nodes to use.
 */
Path.prototype.setNodes = function(nodes)
{
    this._nodes = wade.cloneArray(nodes);
};

/**
 * Set a node in the path
 * @param {number} nodeIndex The index of the node to change
 * @param {object} nodeData The data to set for the node. This is an object that can contain any of the following fields (all optional):<br/>
 {<br/>
 	tweenType: string - it can be 'linear', 'quadratic', 'cubic', 'quartic', 'quintic', 'sinusoidal', 'exponential', 'circular'<br/>
 	position: {x: number, y: number},<br/>
 	size: {x: number, y: number},<br/>
 	opacity: number,<br/>
 	rotation: number,<br/>
 	properties: {}<br/>
 }<br/>
 * Where <i>properties</i> is an object that can contain any number of custom fields.
 */
Path.prototype.setNode = function(nodeIndex, nodeData)
{
    this._nodes[nodeIndex] = wade.cloneObject(nodeData);
};

/**
 * Get a copy of the nodes array
 * @returns {Array} A copy of the nodes array
 */
Path.prototype.getNodes = function()
{
    return wade.cloneArray(this._nodes);
};

/**
 * Add a node to the path.
 * @param {object} node A node data structure. See the documentation of <i>setNode</i> for mode details.
 * @returns {Number} The index of the node in the nodes array
 */
Path.prototype.addNode = function(node)
{
    return this._nodes.push(node) - 1;
};

/**
 * Remove a node from the array of nodes
 * @param {number} [nodeIndex = 0] The index of the node to remove
 */
Path.prototype.removeNode = function(nodeIndex)
{
	nodeIndex = nodeIndex || 0;
    wade.removeObjectFromArrayByIndex(nodeIndex, this._nodes);
};

/**
 * Get the data for a node in the path. Note that this is a copy of the data, if you want to access the node object that is in the path directly, please use <i>getNodeRef</i>.
 * @param {number} [nodeIndex] The index of the node. If omitted, the first node will be returned.
 * @returns {Object} A copy of the node data
 */
Path.prototype.getNode = function(nodeIndex)
{
	nodeIndex = nodeIndex || 0;
    return this._nodes[nodeIndex] && wade.cloneObject(this._nodes[nodeIndex]);
};

/**
 * Get the data for a node in the path. Note that this is NOT a copy of the data, but a reference to it.
 * @param {number} [nodeIndex] The index of the node. If omitted, the first node will be returned.
 * @returns {Object} The node data
 */
Path.prototype.getNodeRef = function(nodeIndex)
{
	nodeIndex = nodeIndex || 0;
	return this._nodes[nodeIndex];
};

/**
 * Get the current number of nodes in the path
 * @returns {Number} The number of nodes in the path
 */
Path.prototype.getNodeCount = function()
{
	return this._nodes.length;
};

/**
 * Get the name of the path
 * @returns {string}
 */
Path.prototype.getName = function()
{
    return this._name;
};

/**
 * Set a name for this path
 * @param {string} name The name to set
 */
Path.prototype.setName = function(name)
{
    if (!this._name || this._name != name)
    {
        var oldName = this._name;
        this._name = name;
        wade.onObjectNameChange(this, oldName, this._name);
    }
};

/**
 * Check whether the path is currently in the scene
 * @returns {boolean} Whether the path is currently in the scene
 */
Path.prototype.isInScene = function()
{
    return this._inScene;
};

/**
 * Create an object representation of the path. This can be used to construct a new path, passing it directly into the Path constructor.
 * @param {boolean} stringify Whether a string representation of the object should be returned, rather than the object itself
 * @returns {object} An object representation of the path.
 */
Path.prototype.serialize = function(stringify)
{
    var path = {type: 'Path', nodes: wade.cloneArray(this._nodes), name: this._name};
    if (stringify)
    {
        path = JSON.stringify(path, null, '\t');
    }
    return path;
};

/**
 * Create a clone of the path
 * @returns {Path} A new Path object
 */
Path.prototype.clone = function()
{
    var newPath = new Path(this.serialize());
    newPath._inScene = false;
    return newPath;
};

/**
 * Create sprites to provide a visual representation of the path
 * @param {boolean} [toggle] Whether to enable or disable debug drawing. If omitted, this parameter is assumed to be true.
 * @param {number} [layerId] The layer that the sprites will use. By default this is 1.
 * @returns {SceneObject} A SceneObject that contains all the sprites needed for the debug draw.
 */
Path.prototype.debugDraw = function(toggle, layerId)
{
	if (typeof(toggle) == 'undefined')
	{
		toggle = true;
	}
	if (typeof(layerId) == 'undefined')
	{
		layerId = 1;
	}
	if (toggle)
	{
		if (!this._debugDraw)
		{
			this._debugDraw = new SceneObject();
			this._debugDraw.noExport = true;
		}
		if (!this._debugDraw.isInScene())
		{
			wade.addSceneObject(this._debugDraw, false);
		}
		this._debugDraw.removeAllSprites();
		for (var i=0; i<this._nodes.length; i++)
		{
			if (this._nodes[i] && this._nodes[i].position)
			{
				var sprite = new Sprite(null, layerId);
				sprite.setSize(32, 32);
				sprite.setDrawFunction(wade.drawFunctions.gradientFill_({x:1, y:1}, ['#ff00ff', '#ffffff', '#880000']));
				sprite.nodeIndex = i;
				sprite.isNodeSprite = true;
				var offset = {x: this._nodes[i].position.x, y: this._nodes[i].position.y, angle: this._nodes[i].rotation || 0};
				var textSprite = new TextSprite(i.toString(), '20px Arial', '#ff00ff', 'center', layerId);
				textSprite.setOutline(1, '#000');
				textSprite.nodeIndex = i;
				textSprite.isNodeSprite = true;
				if (this._nodes[i+1] && this._nodes[i+1].position)
				{
					var p = {x: this._nodes[i].position.x, y: this._nodes[i].position.y};
					var d = this._nodes[i+1].position;
					var delta = wade.vec2.sub(d, p);
					var numDots = Math.floor(wade.vec2.length(delta) / 32);
					var line = new Sprite(null, layerId);
					line.setSize(wade.vec2.length(delta), 2);
					line.setDrawFunction(wade.drawFunctions.solidFill_('#ff88ff'));
					var lineOffset = wade.vec2.add(p, wade.vec2.scale(delta, 0.5));
					lineOffset.angle = Math.atan2(p.y - d.y, p.x - d.x);
					this._debugDraw.addSprite(line, lineOffset);
					var interpolate = this._getInterpolationFunction(i);
					for (var j=0; j<numDots; j++)
					{
						var pos = {x: interpolate(j / (numDots-1), p.x, delta.x), y: interpolate(j / (numDots-1), p.y, delta.y)};
						if (j != numDots-1)
						{
							var circle = new Sprite(null, layerId);
							circle.setSize(12, 12);
							circle.setDrawFunction(wade.drawFunctions.solidFill_('#ff00ff'));
							circle.nodeIndex = i;
							circle.isIntermediateSprite = true;
							this._debugDraw.addSprite(circle, pos);
						}
					}
				}
				this._debugDraw.addSprite(sprite, offset);
				offset.y += 10;
				this._debugDraw.addSprite(textSprite, offset);
			}
		}
	}
	else
	{
		wade.removeSceneObject(this._debugDraw);
		this._debugDraw = null;
	}
	return this._debugDraw;
};

/**
 * Get the object that is being used for the debug drawing of this path (if enabled).
 * @returns {SceneObject|null} The SceneObject that contains all the debug draw sprites, or null if debug drawing isn't enabled
 */
Path.getDebugDrawObject = function()
{
	return this._debugDraw || null;
};

/**
 * Evaluate the properties of the path at the specified time, and apply them to a SceneObject.
 * @param {SceneObject} sceneObject The SceneObject to apply the properties to
 * @param {number} time The path time
 * @returns {number} The index of the node that marks the start of the segment for the specified time
 */
Path.prototype.evaluate = function(sceneObject, time)
{
	var nodeA, nodeB;
	var totalTime = 0;
	var previousTime = 0;
	for (var i=0; i<this._nodes.length-1; i++)
	{
		previousTime = totalTime;
		totalTime += this._nodes[i].duration;
		if (totalTime >= time)
		{
			var nodeIndex = i;
			nodeA = this._nodes[i];
			nodeB = this._nodes[i+1];
			break;
		}
	}
	if (!nodeA || !nodeB)
	{
		return (this._nodes.length-1);
	}
	var timeFraction = (time - previousTime) / nodeA.duration;
	var interpolationFunction = this._getInterpolationFunction(i);
	if (typeof(nodeA.position) != 'undefined')
	{
		sceneObject.setPosition(this._evaluateProperty('position', interpolationFunction, timeFraction, nodeA, nodeB));
	}
	if (typeof(nodeA.rotation) != 'undefined')
	{
		sceneObject.setRotation(this._evaluateProperty('rotation', interpolationFunction, timeFraction, nodeA, nodeB));
	}
	if (typeof(nodeA.size) != 'undefined')
	{
		var size = this._evaluateProperty('size', interpolationFunction, timeFraction, nodeA, nodeB);
		for (var j=0; j<sceneObject.getSpriteCount(); j++)
		{
			sceneObject.getSprite(j).setSize(size.x, size.y);
		}
	}
	if (typeof(nodeA.opacity) != 'undefined')
	{
		var opacity = this._evaluateProperty('opacity', interpolationFunction, timeFraction, nodeA, nodeB);
		for (j=0; j<sceneObject.getSpriteCount(); j++)
		{
			var sprite = sceneObject.getSprite(j);
			var mods = sprite.getDrawModifiers();
			for (var k=mods.length-1; k>=0; k--)
			{
				var m = mods[k];
				if (m.type == 'alpha' || m.type == 'fadeOpacity')
				{
					wade.removeObjectFromArrayByIndex(k, mods);
				}
			}
			mods.push({type: 'alpha', alpha: opacity});
			var proto = (sprite instanceof TextSprite)? TextSprite.prototype: Sprite.prototype;
			var defaultDraw = (wade.getLayer(sprite.getLayerId()).getRenderMode() == 'webgl')? proto.draw_gl : proto.draw;
			sprite.setDrawFunction(defaultDraw);
			sprite.setDrawModifiers(mods);
		}
	}
	if (nodeA.properties && nodeB.properties)
	{
		for (var p in nodeA.properties)
		{
			var v = this._evaluateProperty(p, interpolationFunction, timeFraction, nodeA.properties, nodeB.properties);
			sceneObject[p] = v;
			for (j=0; j<sceneObject.getSpriteCount(); j++)
			{
				sprite = sceneObject.getSprite(j);
				sprite[p] = v;
			}
		}
	}
	return nodeIndex;
};

/**
 * Set the properties of a node based on the current values present in a SceneObject. This function looks at the properties that are defined on the next node to determine which properties should be affected in the current node.
 * @param {SceneObject} sceneObject The SceneObject to use
 * @param {number} [nodeIndex = 0] The index of the node that you want to modify
 */
Path.prototype.setFromSceneObject = function(sceneObject, nodeIndex)
{
	nodeIndex = nodeIndex || 0;
	var node = this._nodes[nodeIndex];
	var nextNode = this._nodes[nodeIndex+1];
	if (!node || !nextNode)
	{
		return;
	}
	if (typeof(nextNode.position) != 'undefined')
	{
		node.position = sceneObject.getPosition();
	}
	if (typeof(nextNode.rotation) != 'undefined')
	{
		node.rotation = sceneObject.getRotation();
	}
	if (typeof(nextNode.size) != 'undefined' && sceneObject.getSprite())
	{
		node.size = sceneObject.getSprite().getSize();
	}
	if (typeof(nextNode.opacity) != 'undefined' && sceneObject.getSprite())
	{
		var mods = sceneObject.getSprite().getDrawModifiers();
		for (var i=0; i<mods.length; i++)
		{
			if (mods[i].type == 'alpha')
			{
				node.opacity = mods[i].alpha || 0;
			}
		}
	}
	if (nextNode.properties)
	{
		for (var p in nextNode.properties)
		{
			var val;
			var prop = sceneObject[p];
			if (typeof(prop) != 'undefined')
			{
				if (typeof(prop) == 'object')
				{
					val = wade.isArray(prop)? wade.cloneArray(prop) : wade.cloneObject(prop);
				}
				else
				{
					val = prop;
				}
				break;
			}
			for (var s=0; s<sceneObject.getSpriteCount(); s++)
			{
				var spriteProp = sceneObject.getSprite(s)[p];
				if (typeof(spriteProp) != 'undefined')
				{
					if (typeof(spriteProp) == 'object')
					{
						val = wade.isArray(spriteProp)? wade.cloneArray(spriteProp) : wade.cloneObject(spriteProp);
					}
					else
					{
						val = spriteProp;
					}
					break;
				}

			}
		}
	}
};

// Undocumented (i.e. non-exposed) functions:
Path.prototype.onAddToScene = function()
{
    this._inScene = true;
};

Path.prototype.onRemoveFromScene = function()
{
    this._inScene = false;
	wade.removeSceneObject(this._debugDraw);
};

Path.prototype._evaluateProperty = function(property, interpolationFunction, timeFraction, parentA, parentB)
{
	if (typeof(parentB[property]) == 'undefined')
	{
		return parentA[property];
	}

	var type = typeof(parentA[property]);
	if (type == 'object')
	{
		var result = {};
		for (var p in parentA[property])
		{
			result[p] = this._evaluateProperty(p, interpolationFunction, timeFraction, parentA[property], parentB[property]);
		}
		return result;
	}
	else if (type == 'number')
	{
		return interpolationFunction(timeFraction, parentA[property], parentB[property] - parentA[property]);
	}
	else
	{
		return property[parentA];
	}
};

Path.prototype._getInterpolationFunction = function(nodeIndex)
{
	var node = this._nodes[nodeIndex];
	var tweenType = node.tweenType;
	var functionName = '_interpolate_' + tweenType + (node.easeIn? '1': '0') + (node.easeOut? '1': '0');
	return this[functionName] || this._lerp;

};

Path.prototype._lerp = function(t, b, c)
{
	return c * t  + b;
};

Path.prototype._interpolate_quadratic10 = function(t, b, c)
{
	return c*t*t + b;
};

Path.prototype._interpolate_quadratic01 = function(t, b, c)
{
	return -c * t*(t-2) + b;
};

Path.prototype._interpolate_quadratic11 = function(t, b, c)
{
	t *= 2;
	if (t < 1)
	{
		return c/2*t*t + b;
	}
	t--;
	return -c/2 * (t*(t-2) - 1) + b;
};

Path.prototype._interpolate_cubic10 = function(t, b, c)
{
	return c*t*t*t + b;
};

Path.prototype._interpolate_cubic01 = function(t, b, c)
{
	t--;
	return c*(t*t*t + 1) + b;
};

Path.prototype._interpolate_cubic11 = function(t, b, c)
{
	t *= 2;
	if (t < 1)
	{
		return c*t*t*t/2 + b;
	}
	t -= 2;
	return c/2 * (t*t*t + 2) + b;
};

Path.prototype._interpolate_quartic10 = function(t, b, c)
{
	return c*t*t*t*t + b;
};

Path.prototype._interpolate_quartic01 = function(t, b, c)
{
	t--;
	return -c*(t*t*t*t -1) + b;
};

Path.prototype._interpolate_quartic11 = function(t, b, c)
{
	t *= 2;
	if (t < 1)
	{
		return c*t*t*t*t/2 + b;
	}
	t -= 2;
	return -c/2 * (t*t*t*t - 2) + b;
};

Path.prototype._interpolate_quintic10 = function(t, b, c)
{
	return c*t*t*t*t*t + b;
};

Path.prototype._interpolate_quintic01 = function(t, b, c)
{
	t--;
	return c * (t*t*t*t*t + 1) + b;
};

Path.prototype._interpolate_quintic11 = function(t, b, c)
{
	t *= 2;
	if (t < 1)
	{
		return c*t*t*t*t*t/2 + b;
	}
	t -= 2;
	return c/2 * (t*t*t*t*t + 2) + b;
};

Path.prototype._interpolate_sinusoidal10 = function(t, b, c)
{
	return -c * Math.cos(t * Math.PI / 2) + c + b;
};

Path.prototype._interpolate_sinusoidal01 = function(t, b, c)
{
	return c * Math.sin(t * Math.PI / 2) + b;
};

Path.prototype._interpolate_sinusoidal11 = function(t, b, c)
{
	return -c/2 * (Math.cos(t * Math.PI) - 1) + b;
};

Path.prototype._interpolate_exponential10 = function(t, b, c)
{
	return c * Math.pow(2, 10 * (t - 1)) + b;
};

Path.prototype._interpolate_exponential01 = function(t, b, c)
{
	return c * (-Math.pow(2, -10 * t)  + 1) + b;
};

Path.prototype._interpolate_exponential11 = function(t, b, c)
{
	t *= 2;
	if (t < 1)
	{
		return c/2 * Math.pow(2, 10 * (t-1)) + b;
	}
	t--;
	return c/2 * (-Math.pow(2, -10*t) + 2) + b;
};

Path.prototype._interpolate_circular10 = function(t, b, c)
{
	return -c * (Math.sqrt(1 - t*t) - 1) + b;
};

Path.prototype._interpolate_circular01 = function(t, b, c)
{
	t--;
	return c * Math.sqrt(1 - t*t) + b;
};

Path.prototype._interpolate_circular11 = function(t, b, c)
{
	t *= 2;
	if (t<1)
	{
		return -c/2 * (Math.sqrt(1 - t*t)-1) + b;
	}
	t -= 2;
	return c/2 * (Math.sqrt(1 - t*t) + 1) + b;
};

