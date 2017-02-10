wade.physics.world = new (function()
{
	this.positionIterations = 4;
	this.velocityIterations = 2;
	this.timeStep = wade.c_timeStep;

	 // Get the current box2d world object. Provides passthrough object for accessing box2d world
	this.getB2DWorld = function()
	{
		return this.world;
	};

	// Get the current box2d world object settings.
	// returns {object) the box2d world object settings where:
	// timeStep is a number, the curent world timeStep value
	// positionIterations is a number, the current world positionIterations value.
	// velocityIterations is a number, the current world velocityIterations value.
	// gravity is an object with <i>x</i> and <i>y</i> fields, describing the world current gravity settings.
	this.getB2DWorldSettings = function()
	{
		return {
			timeStep: this.timeStep,
			positionIterations: this.positionIterations,
			velocityIterations: this.velocityIterations,
			gravity: this.getGravity()
		};
	};

	// Create the box2d world object. Called internally by b2dPhysics on init. Should not be called by user directly.
	// Note: in box 2d, positive y goes up and negative y goes down. So earth gravity would be {x:0, y:-9.81}
	this.createWorld = function(g)
	{
		var gravity = new box2d.b2Vec2(g.x,g.y);
		this.world = new box2d.b2World(gravity);
		return this.world;
	};

	// Get the box2d world gravity
	this.getGravity = function()
	{
		return this.world.GetGravity();
	};

	// Set the box2d world gravity
	this.setGravity = function(g)
	{
		var gravity = new box2d.b2Vec2(g.x,g.y);
		this.world.SetGravity(gravity);
	};

	// Step the box2d physics simulation using the current settings
	this.step = function()
	{
		this.world.Step(this.timeStep,this.velocityIterations,this.positionIterations);
		// if m_flag_clearForces flag set to true, which it is by default, don't have to ClearForces manually
		// if for some reason a user sets the clearForces flag to false, then you must clear forces manually.
		// this.world.ClearForces();
	};

	// Add a box2d body to the box2d simulation
	this.createBody = function(bodyDef)
	{
		return this.world.CreateBody(bodyDef);
	};

	// Remove a box2d body from the box2d simulation
	this.destroyBody = function(body)
	{
		this.world.DestroyBody(body);
	};
})();
