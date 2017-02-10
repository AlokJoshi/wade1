/**
 * PhysicsObject is a behavior to be used with WADE, and is part of the wade.physics plug-in.<br/>
 * It gives you access to many physical properties for WADE objects.<br/>
 * Example usage:
 * var mySceneObject = new SceneObject(mySprite, PhysicsObject);<br/>
 * mySceneObject.getBehavior().linearDamping = 0.3;
 * @constructor
 */
PhysicsObject = function()
{
	var self = this;
	this.name = 'PhysicsObject';

	// we're working on a custom physics shape editor - not quite ready just yet
	this.customEditor = {title: "Edit Physics Shapes", module: "physicsShapeEditor"};

	var bodyTypeMap = {'static': box2d.b2BodyType.b2_staticBody, 'dynamic': box2d.b2BodyType.b2_dynamicBody, 'kinematic': box2d.b2BodyType.b2_kinematicBody};
	var bodyType = 'static';
	var bullet = false;
	var gravityScale = 1;
	var linearDamping = 0;
	var angularDamping = 0;
	var fixedRotation = false;
	var allowSleeping = true;
	var active = true;

	var mouseJoints = [];

	/**
	 * The type of physics body. This is 'static' by default, indicating an immovable object. It can also be 'dynamic' or 'kinematic'
	 * @property {string}
	 * @name PhysicsObject#bodyType
	 */
	Object.defineProperty(this, 'bodyType',
	{
		enumerable: true,
		set: function(val)
		{
			if (self._b2dBody)
			{
				self._b2dBody.SetType(bodyTypeMap[val]);
			}
			bodyType = val;
		},
		get: function()
		{
			return bodyType;
		}
	});
	this.bodyType_options = ['static', 'dynamic', 'kinematic'];

	/**
	 * Whether the object is a bullet (a fast-moving object), which implies that it needs continuous collision detection to avoid going throug object
	 * @property {boolean}
	 * @name PhysicsObject#bullet
	 */
	Object.defineProperty(this, 'bullet',
	{
		enumerable: true,
		set: function(val)
		{
			if (self._b2dBody)
			{
				self._b2dBody.SetBullet(val);
			}
			bullet = val;
		},
		get: function()
		{
			return bullet;
		}
	});

	/**
	 * A number to multiply the effect of gravity on this body. Setting this to 0 means that the object is not affected by gravity.
	 * @property {number}
	 * @name PhysicsObject#gravityScale
	 */
	Object.defineProperty(this, 'gravityScale',
	{
		enumerable: true,
		set: function(val)
		{
			if (self._b2dBody)
			{
				self._b2dBody.SetGravityScale(val);
			}
			gravityScale = val;
		},
		get: function()
		{
			return gravityScale;
		}
	});

	/**
	 * The amount of damping (reduction in velocity) that is caused by linear motion. Usually between 0 and 1 (0 by default).
	 * @property {number}
	 * @name PhysicsObject#linearDamping
	 */
	Object.defineProperty(this, 'linearDamping',
	{
		enumerable: true,
		set: function(val)
		{
			if (self._b2dBody)
			{
				self._b2dBody.SetLinearDamping(val);
			}
			linearDamping = val;
		},
		get: function()
		{
			return linearDamping;
		}
	});

	/**
	 * The amount of damping (reduction in velocity) that is caused by angular motion. Usually between 0 and 1 (0 by default).
	 * @property {number}
	 * @name PhysicsObject#angularDamping
	 */
	Object.defineProperty(this, 'angularDamping',
	{
		enumerable: true,
		set: function(val)
		{
			if (self._b2dBody)
			{
				self._b2dBody.SetAngularDamping(val);
			}
			angularDamping = val;
		},
		get: function()
		{
			return angularDamping;
		}
	});

	/**
	 * Whether this object should only translate and never rotate.
	 * @property {boolean}
	 * @name PhysicsObject#fixedRotation
	 */
	Object.defineProperty(this, 'fixedRotation',
	{
		enumerable: true,
		set: function(val)
		{
			if (self._b2dBody)
			{
				self._b2dBody.SetFixedRotation(val);
			}
			fixedRotation = val;
		},
		get: function()
		{
			return fixedRotation;
		}
	});

	/**
	 * Whether this object should be allowed to sleep. Objects are set to sleep when resting on other objects, to speed up the simulation.
	 * @property {boolean}
	 * @name PhysicsObject#allowSleeping
	 */
	Object.defineProperty(this, 'allowSleeping',
	{
		enumerable: true,
		set: function(val)
		{
			if (self._b2dBody)
			{
				self._b2dBody.SetSleepingAllowed(val);
			}
			allowSleeping = val;
		},
		get: function()
		{
			return allowSleeping;
		}
	});

	/**
	 * Whether the physics object is active. Inactive objects are not simulated and cannot be collided with.
	 * @property {boolean}
	 * @name PhysicsObject#active
	 */
	Object.defineProperty(this, 'active',
	{
		enumerable: true,
		set: function(val)
		{
			if (self._b2dBody)
			{
				self._b2dBody.SetActive(val);
			}
			active = val;
		},
		get: function()
		{
			return active;
		}
	});

	var init = function(parameters)
	{
		parameters = parameters || {};
		var fData = parameters.fData || {};
		fData.sprite = fData.sprite || self.owner.getSprite();
		var wadePosition = self.owner.getPosition();

		self.bodyType = parameters.bodyType || self.bodyType;
		self.bullet = parameters.bullet || self.bullet;
		self.gravityScale = parameters.gravityScale || self.gravityScale;
		self.linearDamping = parameters.linearDamping || self.linearDamping;
		self.angularDamping = parameters.angularDamping || self.angularDamping;
		self.fixedRotation = parameters.fixedRotation || self.fixedRotation;
		self.collidingWith = {};

		// create the box2d body
		var bodyDef = new box2d.b2BodyDef();
		bodyDef.type = bodyTypeMap[self.bodyType];

		var boxPos = wade.physics.wadeToBox(wadePosition);
		bodyDef.position.Set(boxPos.x, boxPos.y);
		bodyDef.angle = -self.owner.getRotation();
		bodyDef.userData = {sceneObject: self.owner};
		bodyDef.bullet = self.bullet;
		bodyDef.gravityScale = self.gravityScale;
		bodyDef.linearDamping = self.linearDamping;
		bodyDef.angularDamping = self.angularDamping;
		bodyDef.fixedRotation = self.fixedRotation;

		self._b2dBody = wade.physics.createBody(bodyDef);
		for (var i=0; i<self.fixtures.length; i++)
		{
			self.addFixture(self.fixtures[i]);
		}

		self.owner.setPosition = function(posX, posY)
		{
			SceneObject.prototype.setPosition.call(this, posX, posY);
			var wadePosition = typeof(posX) == 'object'? posX : {x: posX, y: posY};
			var boxPosition = wade.physics.wadeToBox(wadePosition);
			var boxVector = new box2d.b2Vec2(boxPosition.x,boxPosition.y);
			self._b2dBody.SetPosition(boxVector);
		};

		self.owner.setRotation = function(angle)
		{
			SceneObject.prototype.setRotation.call(this, angle);
			self._b2dBody.SetAngle(-angle);
		};

		self.owner.setVelocity = function(velocityX, velocityY)
		{
			this.stopMoving();
			var wadeVelocity = typeof(velocityX) == 'object'? velocityX : {x: velocityX, y: velocityY};
			var boxVelocity = wade.physics.wadeToBox(wadeVelocity);
			var boxVector = new box2d.b2Vec2(boxVelocity.x,boxVelocity.y);
			self._b2dBody.SetLinearVelocity(boxVector);
		};

		self.owner.setAngularVelocity = function(angularVelocity)
		{
			self._b2dBody.SetAngularVelocity(-angularVelocity);
		};

		self.owner.getVelocity = function()
		{
			var boxVelocity = self._b2dBody.GetLinearVelocity();
			return wade.physics.boxToWade(boxVelocity);
		};

		self.owner.getAngularVelocity = function()
		{
			return -self._b2dBody.GetAngularVelocity();
		};
	};

	this.onAddToScene = function(parameters)
    {
		// delay initialisation in case the object is added during a physics step (it's quite a common case)
		if (wade.physics.isStepping())
		{
			setTimeout(function() {init(parameters)}, 0);
		}
		else
		{
			init(parameters);
		}
	};
	
	this.onRemoveFromScene = function()
    {
		if (self._b2dBody)
        {
			// delay body removal in case this happens during a physics step (box2d doesn't like objects being removed during a step)
			setTimeout(function()
			{
				wade.physics.world.destroyBody(self._b2dBody);
				self._b2dBody = null;
			}, 0);
		}
	};

	/**
	* Check whether the physics object is awake or not. Objects can be not awake when they're resting on top of other objects, to improve the performance of the simulation
	* @returns {boolean} Whether the physics object is awake
	*/
	this.isAwake = function()
	{
		return self._b2dBody && self._b2dBody.IsAwake();
	};
	
	/**
	* Set a physics object as awake or not. Objects can be not awake when they're resting on top of other objects, to improve the performance of the simulation
	* @params {boolean} Whether the physics object should be awake
	*/
	this.setAwake = function(value)
	{
		self._b2dBody && self._b2dBody.SetAwake(value);
	};

	/**
	* Add a fixture to the physics body. A fixture is a convex shape with physics properties, and each physics body can have any number of fixtures.
	* @params {object} fData The fixture data for the fixture to add to this body. The data structure is as follows - please refer to the box2d documentation for a full explanation of each parameter: <pre>
	density: number
	filter: {categoryBits: number, groupIndex: number, maskBits: number}
	friction: number
	isSensor: number
	restitution: number
	offset: {x: number, y: number, ang: number}
	shapeType: string (valid values are 'edge', 'chain', 'loopChain', 'box', 'circle', 'polygon')
	vertices: [{x: number, y: number}]
	</pre>
	@returns {object} The fixture object. This can later be used to remove a fixture through removeFixture().
	*/
	this.addFixture = function(fData)
	{
		var fixtureData = wade.cloneObject(fixtures.elementTemplate);
		if (fData)
		{
			for (var k in fData)
			{
				if (fData.hasOwnProperty(k))
				{
					fixtureData[k] = fData[k];
				}
			}
		}
		var fixDef = new box2d.b2FixtureDef();
		fixDef.density = fixtureData.density;
		fixDef.filter.categoryBits = fixtureData.filter.categoryBits;
		fixDef.filter.groupIndex = fixtureData.filter.groupIndex;
		fixDef.filter.maskBits = fixtureData.filter.maskBits;
		fixDef.friction = fixtureData.friction;
		fixDef.isSensor = fixtureData.isSensor;
		fixDef.restitution = fixtureData.restitution;
		fixDef.offset = fixtureData.offset;
		var scale = wade.physics.getScale();
		var i, points, boxVertex, vec, wadeSize, sprite, minX, minY, maxX, maxY;
		switch (fixtureData.shapeType)
		{
			case 'edge':
				// Note - edge vertices are offet values from the edge scene object position
				if (fixtureData.vertices.length < 2)
				{
					wade.log('Error: box2d Edge shape requires two vertices - edge shape was not created');
					break;
				}
				else if (fixtureData.vertices.length > 2)
				{
					wade.log('Error: box2d Edge shape requires two vertices - any other vertices will be ignored');
				}
				points = [];
				for (i=0; i < 2; i++)
				{
					boxVertex = wade.physics.wadeToBox(fixtureData.vertices[i]);
					vec = new box2d.b2Vec2();
					vec.Set(boxVertex.x,boxVertex.y);
					points[i] = vec;
				}
				fixDef.shape = new box2d.b2EdgeShape();
				fixDef.shape.Set(points[0],points[1]);
				break;
			case 'chain':
				// Note - chain vertices are offset values from the chains scene object position
				points = [];
				for (i=0; i<fixtureData.vertices.length; i++)
				{
					boxVertex = wade.physics.wadeToBox(fixtureData.vertices[i]);
					vec = new box2d.b2Vec2();
					vec.Set(boxVertex.x,boxVertex.y);
					points[i] = vec;
				}
				fixDef.shape = new box2d.b2ChainShape();
				fixDef.shape.CreateChain(points,points.length);
				break;
			case 'loopChain':
				// Note - chain vertices are offset values from the chains scene object position
				points = [];
				for (i=0; i<fixtureData.vertices.length; i++)
				{
					boxVertex = wade.physics.wadeToBox(fixtureData.vertices[i]);
					vec = new box2d.b2Vec2();
					vec.Set(boxVertex.x,boxVertex.y);
					points[i] = vec;
				}
				fixDef.shape = new box2d.b2ChainShape();
				fixDef.shape.CreateLoop(points,points.length);
				break;
			case 'polygon':
				// Note - give vertices in counterclockwise order in wade. i.e. (0,0)(1,1) (-1,-1).
				// This translates into clockwise order for box because of flipped y axis
				//  It is recommended that box2d polygons be eight vertices or less;
				points = [];
				for (i=0; i<fixtureData.vertices.length; i++)
				{
					boxVertex = wade.physics.wadeToBox(fixtureData.vertices[i]);
					vec = new box2d.b2Vec2();
					vec.Set(boxVertex.x,boxVertex.y);
					points[i] = vec;
				}
				fixDef.shape = new box2d.b2PolygonShape();
				fixDef.shape.Set(points,points.length,0);
				break;
			case 'box':
				fixDef.shape = new box2d.b2PolygonShape();
				sprite = self.owner.getSprite(fixtureData.spriteIndex);
				var boxWidth = 0;
				var boxHeight = 0;
				if (sprite && fixtureData.autoCalculateShape)
				{
					wadeSize = sprite.getSize();
					boxWidth = wade.physics.wadeToBoxScalar(wadeSize.x)/2;
					boxHeight = wade.physics.wadeToBoxScalar(wadeSize.y)/2;
				}
				else if (fixtureData.vertices.length)
				{
					minX = maxX = fixtureData.vertices[0].x;
					minY = maxY = fixtureData.vertices[0].y;
					for (i=1; i<fixtureData.vertices.length; i++)
					{
						minX = Math.min(minX, fixtureData.vertices[i].x);
						minY = Math.min(minY, fixtureData.vertices[i].y);
						maxX = Math.max(maxX, fixtureData.vertices[i].x);
						maxY = Math.max(maxY, fixtureData.vertices[i].y);
					}
					boxWidth = (maxX - minX)/2;
					boxHeight = (maxY - minY)/2;
				}
				if (!fixDef.offset.x && !fixDef.offset.y && !fixDef.offset.ang)
				{
					fixDef.shape.SetAsBox(boxWidth, boxHeight);
				}
				else
				{
					var boxLocalCenter = wade.physics.wadeToBox({x:fixDef.offset.x, y:fixDef.offset.y});
					var localCenter = new box2d.b2Vec2(boxLocalCenter.x,boxLocalCenter.y);
					fixDef.shape.SetAsBox(boxWidth/scale, boxHeight/scale, localCenter, fixDef.offset.ang);
				}
				break;
			case 'circle':
				sprite = self.owner.getSprite(fixtureData.spriteIndex);
				var radius = 0;
				if (sprite && fixtureData.autoCalculateShape)
				{
					wadeSize = sprite.getSize();
					radius = wade.physics.wadeToBoxScalar(Math.max(wadeSize.x, wadeSize.y))/2;
				}
				else if (fixtureData.vertices.length)
				{
					var v0 = wade.physics.wadeToBox(fixtureData.vertices[0]);
					radius = Math.max(Math.abs(v0.x), Math.abs(v0.y));
					for (i = 1; i < fixtureData.vertices.length; i++)
					{
						var vi = wade.physics.wadeToBox(fixtureData.vertices[i]);
						radius = Math.max(radius, Math.abs(vi.x));
						radius = Math.max(radius, Math.abs(vi.y));
					}
				}
				fixDef.shape = new box2d.b2CircleShape(radius);
				if (fixDef.offset.x || fixDef.offset.y)
				{
					var boxOffset = wade.physics.wadeToBox(fixDef.offset);
					fixDef.shape.m_p.Set(boxOffset.x,boxOffset.y);
				}
				break;
			default:
				wade.warn('Warning - unknown shape type ' + fixtureData.shapeType);
				break;
		}

		var b2dFixture = self._b2dBody.CreateFixture(fixDef);

		var density = fData.density;
		Object.defineProperty(fData, 'density',
			{
				enumerable: true,
				configurable: true,
				set: function(val)
				{
					if (self._b2dBody && b2dFixture)
					{
						b2dFixture.SetDensity(val);
						self._b2dBody.ResetMassData();
					}
					density = val;
				},
				get: function()
				{
					return density;
				}
			});

		var friction = fData.friction;
		Object.defineProperty(fData, 'friction',
			{
				enumerable: true,
				configurable: true,
				set: function(val)
				{
					if (self._b2dBody && b2dFixture)
					{
						b2dFixture.SetFriction(val);
					}
					friction = val;
				},
				get: function()
				{
					return friction;
				}
			});

		var restitution = fData.restitution;
		Object.defineProperty(fData, 'restitution',
			{
				enumerable: true,
				configurable: true,
				set: function(val)
				{
					if (self._b2dBody && b2dFixture)
					{
						b2dFixture.SetRestitution(val);
					}
					restitution = val;
				},
				get: function()
				{
					return restitution;
				}
			});

		var shapeType = fData.shapeType;
		Object.defineProperty(fData, 'shapeType',
			{
				enumerable: true,
				configurable: true,
				set: function(val)
				{
					if (self._b2dBody && b2dFixture)
					{
						wade.error('Cannot change the shape type at runtime');
					}
					shapeType = val;
				},
				get: function()
				{
					return shapeType;
				}
			});

		var isSensor = fData.isSensor;
		Object.defineProperty(fData, 'isSensor',
			{
				enumerable: true,
				configurable: true,
				set: function(val)
				{
					if (self._b2dBody && b2dFixture)
					{
						b2dFixture.SetSensor(val);
					}
					isSensor = val;
				},
				get: function()
				{
					return isSensor;
				}
			});

		var filter = fData.filter;
		Object.defineProperty(fData, 'filter',
			{
				enumerable: true,
				configurable: true,
				set: function(val)
				{
					if (self._b2dBody && b2dFixture)
					{
						b2dFixture.SetFilterData(val);
					}
					filter = val;
				},
				get: function()
				{
					return filter;
				}
			});
		
		var offset = fData.offset;
		Object.defineProperty(fData, 'offset',
			{
				enumerable: true,
				configurable: true,
				set: function(val)
				{
					if (self._b2dBody && b2dFixture)
					{
						wade.error("Cannot change a fixture's offset at runtime. Remove the fixture and add a new one instead");
					}
					offset = val;
				},
				get: function()
				{
					return offset;
				}
			});

		var vertices = fData.vertices;
		Object.defineProperty(fData, 'vertices',
			{
				enumerable: true,
				configurable: true,
				set: function(val)
				{
					if (self._b2dBody && b2dFixture)
					{
						wade.error("Cannot change a fixture's vertices at runtime. Remove the fixture and add a new one instead");
					}
					vertices = val;
				},
				get: function()
				{
					return vertices;
				}
			});

		var groupIndex = filter.groupIndex;
		Object.defineProperty(filter, 'groupIndex',
			{
				enumerable: true,
				configurable: true,
				set: function(val)
				{
					filter.groupIndex = val;
					if (self._b2dBody && b2dFixture)
					{
						b2dFixture.SetFilterData(filter);
					}
				},
				get: function()
				{
					return groupIndex;
				}
			});

		var categoryBits = filter.categoryBits;
		Object.defineProperty(filter, 'categoryBits',
			{
				enumerable: true,
				configurable: true,
				set: function(val)
				{
					filter.categoryBits = val;
					if (self._b2dBody && b2dFixture)
					{
						b2dFixture.SetFilterData(filter);
					}
				},
				get: function()
				{
					return categoryBits;
				}
			});

		var maskBits = filter.maskBits;
		Object.defineProperty(filter, 'maskBits',
			{
				enumerable: true,
				configurable: true,
				set: function(val)
				{
					filter.maskBits = val;
					if (self._b2dBody && b2dFixture)
					{
						b2dFixture.SetFilterData(filter);
					}
				},
				get: function()
				{
					return maskBits;
				}
			});

		return b2dFixture;
	};
	
	/**
	* removeFixture Remove a fixture
	* @params {object} The fixture object to remove from this physics body, as previously returned by a call to createFixture
	*/
	this.removeFixture = function(fixture)
	{
		self._b2dBody.DestroyFixture(fixture);
	};
	
	/**
	* Get a list of fixtures attached to this object
	* @returns {Array} An array of fixtures attached to this physics body
	*/
	this.getFixtureList = function()
	{
		return self._b2dBody.GetFixtureList();
	};
	
	/**
	* Get a list of joints attached to this object
	* @returns {Array} an array of joint objects attached to this body
	*/
	this.getJointList = function()
	{
		return self._b2dBody.GetJointList();
	};
	
	this.getDefinition = function() {
		var bd = new box2d.b2BodyDef();
		var bodyDefinition = self._b2dBody.GetDefinition(bd);
		return bodyDefinition;
	};

	/**
	* applyForce
	* Apply a force to a box2d body 
	* As this uses a normalized vector, do not convert the force using wadeToBox.
	* However, since the y axis are reversed in wade vs box2d, multiply the force.y by -1
	* @params {object} force a vector with x and y parameters designating the direction of the force
	* @params (number} power a number to multiply the bodies mass by to generate the total power
	* @params (object} offset a vector with x and y parameters designating the offset poinr at which to apply the force
	*/
	this.applyForce = function(force, power, offset)
	{
		power = power || this.impulsePower;
		force = force || {x:0,y:0};
		offset = offset || {x:0,y:0};
		force.y *= -1;
		wade.vec2.normalizeInPlace(force);
		var forcePower = self._b2dBody.GetMass() * power;
		var forceVector = new box2d.b2Vec2((force.x*forcePower),(force.y*forcePower));
		if (offset.x != 0 || offset.y != 0) {
			var forceOffset = wade.physics.wadeToBox(offset);
			var bodyCenter = self._b2dBody.GetWorldCenter();
			var forcePoint = new box2d.b2Vec2((bodyCenter.x+forceOffset.x),(bodyCenter.y+forceOffset.y));
			self._b2dBody.ApplyForce(forceVector,forcePoint);
		}
		else {
			self._b2dBody.ApplyForceToCenter(forceVector);
		}
	};

	/**
	* applyImpulse
	* Apply an impulse to a box2d body 
	* As this uses a normalized vector, do not convert the impulse using wadeToBox.
	* However, since the y axis are reversed in wade vs box2d, multiply the impulse.y by -1
	* @params {object} impulse a vector with x and y parameters designating the direction of the impulse
	* @params (number} power a number to multiply the bodies mass by to generate the total power
	* @params (object} offset a vector with x and y parameters designating the offset point at which to apply the impulse
	*/
	this.applyImpulse = function(impulse, power, offset)
	{
		power = power || this.impulsePower;
		impulse = impulse || {x:0,y:0};
		offset = offset || {x:0,y:0};
		impulse.y *= -1;
		wade.vec2.normalizeInPlace(impulse);
		var impulsePower = self._b2dBody.GetMass() * power;
		var impulseVector = new box2d.b2Vec2((impulse.x*impulsePower),(impulse.y*impulsePower));
		if (offset.x != 0 || offset.y != 0) {
			var impulseOffset = wade.physics.wadeToBox(offset);
			var bodyCenter = self._b2dBody.GetWorldCenter();
			var impulsePoint = new box2d.b2Vec2((bodyCenter.x+impulseOffset.x),(bodyCenter.y+impulseOffset.y));
			self._b2dBody.ApplyLinearImpulse(impulseVector,impulsePoint);
		}
		else {
			self._b2dBody.ApplyLinearImpulseToCenter(impulseVector);
		}
	};
	
	/**
	* applyTorque
	* Apply a torque to the body in newton-meters
	* Affects the angular velocity but not the linear velocity
	* @params (number) the amount of torque to apply in newton*meters
	*/
	this.applyTorque = function(torque)
	{
		// Since the y axis is reversed, the value is multiplied by -1 before setting
		self._b2dBody.ApplyTorque(-torque);
	};

	/**
	 * Add a mouse joint. A mouse joint is a target point that the object will try to follow when possible.
	 * @param {{x: number, y: number}} offset The point in object-space that will try to track the target point.
	 * @returns A mouse joint object
	 */
	this.addMouseJoint = function(offset)
	{
		var body = self._b2dBody;
		var pos = body.GetPosition();
		if (offset)
		{
			offset = wade.physics.wadeToBox(offset);
			pos.x += offset.x;
			pos.y += offset.y;
		}
		var world = wade.physics.world.getB2DWorld();
		var bodyDef = new box2d.b2BodyDef();
		var groundBody = wade.physics.world.createBody(bodyDef);

		var md = new box2d.b2MouseJointDef();
		md.bodyA = groundBody;
		md.bodyB = body;
		md.target = body.GetWorldCenter();
		md.maxForce = 1000 * body.GetMass();
		var mouseJoint = world.CreateJoint(md);
		mouseJoint.SetTarget(pos);
		mouseJoint.isMouseJoint = true;
		mouseJoints.push(mouseJoint);
		return mouseJoint;
	};

	/**
	 * Update the position of the target point for a mouse joint
	 * @param {object} [joint] The joint object to update, as previously returned by a call to addMouseJoint(). It can be omitted, in which case the first mouse joint will be used.
	 * @param {{x: number, y: number}} pos The new position of the target point
	 */
	this.updateMouseJoint = function(joint, pos)
	{
		if (!joint.isMouseJoint && !pos && mouseJoints[0])
		{
			pos = joint;
			joint = mouseJoints[0];
		}
		pos = wade.physics.wadeToBox(pos);
		var target = new box2d.b2Vec2(pos.x, pos.y);
		joint.SetTarget(target);
	};

	/**
	 * Remove a mouse joint from this object
	 * @param {object} [joint] The joint object to remove. If omitted, the first mouse joint will be removed.
	 */
	this.removeMouseJoint = function(joint)
	{
		if (!joint && mouseJoints[0])
		{
			joint = mouseJoints[0];
		}
		if (joint.GetBodyA == null || joint.GetBodyB == null)
		{
			wade.warn('Warning: Mouse joint missing body, destroyed automatically by the physics engine');
		}
		else
		{
			var world = wade.physics.world.getB2DWorld();
			world.DestroyJoint(joint);
		}
		wade.removeObjectFromArray(joint, mouseJoints);
	};

	this.onUpdate = function()
	{
		if (this._b2dBody)
		{
			var boxPos = self._b2dBody.GetPosition();
			var wadePos = wade.physics.boxToWade(boxPos);
			SceneObject.prototype.setPosition.call(this.owner, wadePos);
			SceneObject.prototype.setRotation.call(this.owner, -this._b2dBody.GetAngle());
		}
	};

	/**
	 * Get a debug draw function that shows the physics object using vector graphics. It currently only works for circle shapes.
	 * @param {string} [color] The color to use to draw the silhouette of the physics object. Default is 'green'.
	 * @param {function} [originalDraw] A draw function to call after drawing the silhouette of the physics object.
	 * @returns {function} A draw function to use with Sprite.setDrawFunction()
	 */
	this.draw_ = function(color, originalDraw)
	{
		color = color || 'green';
		return function(context)
		{
			if (!this.isVisible() || !self._b2dBody)
			{
				return;
			}
			var fixture = self._b2dBody.m_fixtureList;
			var e = wade.screenUnitToWorld(this.getLayer().id);
			var strokeStyle = context.strokeStyle;
			var lineWidth = context.lineWidth;
			context.strokeStyle = color;
			context.lineWidth = 1;
			while (fixture)
			{
				switch (fixture.m_shape.m_type)
				{
					case 0:
						var pos = self.owner.getPosition();
						var rot = self.owner.getRotation();
						var radius = fixture.m_shape.m_radius * wade.physics.getScale() / 2;
						context.beginPath();
						context.arc(pos.x, pos.y, radius-e, 0, 2 * Math.PI, false);
						context.stroke();

						var c = Math.cos(rot);
						var s = Math.sin(rot);
						context.beginPath();
						context.moveTo(pos.x, pos.y);
						context.lineTo(pos.x +s * radius, pos.y - c * radius);
						context.stroke();
						break;
				}

				fixture = fixture.m_next;
			}

			context.strokeStyle = strokeStyle;
			context.lineWidth = lineWidth;
			originalDraw && originalDraw.call(this, context);
		};
	};

	this.clone = function(newOwner)
	{
		var newBehavior = new PhysicsObject();
		['name', 'bodyType', 'bullet', 'gravityScale', 'linearDamping', 'angularDamping', 'fixedRotation', 'allowSleeping', 'active'].forEach(function(k)
		{
			newBehavior[k] = self[k];
		});
		newBehavior.fixtures = wade.cloneObject(fixtures);
		newOwner.setPosition = SceneObject.prototype.setPosition;
		newOwner.setRotation = SceneObject.prototype.setRotation;
		newOwner.setVelocity = SceneObject.prototype.setVelocity;
		newOwner.setAngularVelocity = SceneObject.prototype.setAngularVelocity;
		newOwner.getVelocity = SceneObject.prototype.getVelocity;
		newOwner.getAngularVelocity = SceneObject.prototype.getAngularVelocity;
		return newBehavior;
	};

	// initialize our (pseudo)array of fixtures, defining templates so it is more editor-friendly
	var fixtures = wade.createPseudoArray(64, function (index, fixture, isNew)
	{
		if ((!isNew || !fixture) && fixtures[index])
		{
			self._b2dBody && self.removeFixture(fixtures[index]);
		}
		var b2dFixture = self._b2dBody && self.addFixture(fixture);
	});
	fixtures.elementTemplate =
	{
		density: 1,
		friction: 0.5,
		restitution: 1,
		shapeType: "box",
		shapeType_options: ['box', 'circle', 'polygon', 'edge', 'chain', 'loopChain'],
		spriteIndex: 0,
		isSensor: false,
		autoCalculateShape: true,
		filter:
		{
			groupIndex: 0,
			categoryBits: 1,
			maskBits: 65535
		},
		offset:
		{
			x: 0,
			y: 0,
			ang: 0
		},
		vertices: [{x:0, y: 0}]
	};
	fixtures.elementTemplate.vertices.elementTemplate = {x: 0, y: 0};
	fixtures[0] = wade.cloneObject(fixtures.elementTemplate);
	Object.defineProperty(this, 'fixtures',
	{
		enumerable: true,
		set: function(val)
		{
			for (var i=0; i<val.length; i++)
			{
				fixtures[i] = val[i];
			}
		},
		get: function()
		{
			return fixtures;
		}
	});

};
