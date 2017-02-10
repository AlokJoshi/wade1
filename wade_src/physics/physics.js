/**
 * WADE Physics - This is the physics plugin module for WADE by Clockwork Chilli. It is based on the popular open-source Box2D physics engine.
 * To enable it, simply include the javascript file in your project (after the main WADE module), and include box2d.min.js
 * This object exposes a minimal interface that affects the global physics simulation.
 * Use the PhysicsObject behavior to control several per-object parameters.
 * @version 3.0
 * @constructor
 */
Wade_physics = function()
{
	var self = this;
	var scale = 30;					// how to scale between box2d units and wade units
	var initialized = false;		// whether the physics plugin has been initialized or not
	var running = false;			// is the physics simulation running or not
	var stepping = false;			// are we in the middle of a physics step

//  TODO - implement more joint types
//	this.distanceJoint = new DistanceJoint();
//	this.frictionJoint = new FrictionJoint();
//	this.gearJoint = new GearJoint();
//	this.mouseJoint = new MouseJoint();
//	this.pulleyJoint = new PulleyJoint();
//	this.prismaticJoint = new PrismaticJoint();
//	this.revoluteJoint = new RevoluteJoint();
//	this.ropeJoint = new RopeJoint();
//	this.weldJoint = new WeldJoint();
//	this.wheelJoint = new WheelJoint();

	var initialize = function()
	{
		!initialized && self.init();
	};

	/**
	 * Initialize the physics plugin.
	 * This function must be called once for the physics simulation to work.
	 * This normally happens automatically the fist time you try to use the physics engine and you don't need to call it directly from your code.
	 * @param {object} [options] An object with some of the following fields, which are all optional:<ul>
	 * <li><i>gravity</i>: an object with <i>x</i> and <i>y</i> fields, describing the gravity in meters/seconds squared. By default, this is {x:0, y:9.81}.</li>
	 * <li><i>timeStep</i>: the time interval used in the box2d Step function. Default is wade.c_timeStep</li>
	 * <li><i>positionIterations</i>: a number describing how many positions iterations to use in the box2d solver. Default is 4</li>
	 * <li><i>velocityIterations</i>: a number describing how many velocity iterations to use in the box2d solver. Default is 2</li></ul>
	 */
	this.init = function(options)
	{
		if (initialized)
		{
			wade.warn("Warning - attempting to initialize the physics engine when it's already been initialized");
			return;
		}
		if (!wade.requireVersion || !wade.requireVersion('3.0'))
		{
			wade.warn('Warning - This version of the WADE Physics plug-in requires a newer version of WADE (3.0 or newer)');
			return;
		}
		options = options || {};
		var gravity = options.gravity? {x: options.gravity.x, y: -options.gravity.y} : {x:0, y:-9.81};
		this.world.createWorld(gravity);
		options.timeStep && this.world.setTimeStep(options.timeStep);
		options.positionIterations && this.world.setPositionIterations(options.positionIterations);
		options.velocityIterations && this.world.setVelocityIterations(options.velocityIterations);
        this.collisions.init(); // start receiving collision events

		wade.setMainLoop(function()
		{
			running && self.step();
		}, '_wade_physics');
		initialized = true;
        running = true;
	};

	/**
	 * Check whether the physics engine has been initialized.
	 * @returns {boolean} Whether the physics engine has been initialized.
	 */
	this.isInitialized = function()
	{
		return initialized;
	};

	/**
	 * Stop (pause) the physics simulation.
	 */
	this.stopSimulation = function()
	{
		initialize();
		running = false;
	};

	/**
	 * Start the physics simulation. Note that the simulation is started automatically when <i>wade.physics.init()</i> is called, so it only makes sense to call this function after a call to <i>stopSimulation()</i>.
	 */
	this.startSimulation = function()
	{
		initialize();
		running = true;
	};

	/**
	 * Check whether the physics simulation is currently running
	 * @returns {boolean} Whether the physics simulation is currently running
	 */
	this.isRunning = function()
	{
		initialize();
		return running;
	};

	/**
	 * Step the box2d physics world forward. This normally happens automatically.
	 */
	this.step = function()
	{
		initialize();
		stepping = true;
		this.world.step();
		stepping = false;
	};

	/**
	 * Check whether we are in the middle of a physics step
	 * @returns {boolean}
	 */
	this.isStepping = function()
	{
		return stepping;
	};

	/**
	 * Get the current gravity vector
	 * @returns {{x: number, y: number}} The current gravity vector
	 */
	this.getGravity = function()
	{
		initialize();
		var g = this.world.getGravity();
		return {x: g.x, y: -g.y};
	};

	/**
	 * Set a new value for gravity (by default gravity is {x:0, y:9.81}
	 * @param {{x: number, y: number}} gravity  The new gravity vector
	 */
	this.setGravity = function(gravity)
	{
		initialize();
		return this.world.setGravity({x: gravity.x, y: -gravity.y});
	};

	/**
	 * Set the time step value for the physics simulation. By default this matches WADE's simulation time step (1/60 seconds)
	 * @param {number} timeStep The length (in seconds) of the time step for the physics simulation
	 */
	this.setTimeStep = function(timeStep)
	{
		this.world.timeStep = timeStep;
	};

	/**
	 * Get the current time step value for the physics simulation
	 * @returns {number} The current time step value for the physics simulation
	 */
	this.getTimeStep = function()
	{
		return this.world.timeStep;
	};

	/**
	 * Set the number of iterations for the physics position solver. By default this is 4.
	 * @param {number} positionIterations The number of iterations for the physics position solver. Use a larger number for greater accuracy (but it will be slower)
	 */
	this.setPositionIterations = function(positionIterations)
	{
		this.world.positionIterations = positionIterations;
	};

	/**
	 * Get the current number of iterations for the physics position solver.
	 * @returns {number} The current number of iterations for the physics position solver.
	 */
	this.getPositionIterations = function()
	{
		return this.world.positionIterations;
	};

	/**
	 * Get the current number of iterations ofr the physics velocity solver. By default this is 2.
	 * @param {number} velocityIterations The number of iterations for the physics velocity solver. Use a larger number for greater accuracy (but it will be slower)
	 */
	this.setVelocityIterations = function(velocityIterations)
	{
		this.world.velocityIterations = velocityIterations;
	};

	/**
	 * Get the current number of iterations for the physics velocity solver.
	 * @returns {number} The current number of iterations for the physics velocity solver.
	 */
	this.getVelocityIterations = function()
	{
		return this.world.velocityIterations;
	};


	// ------------------------------------------------------------------------------------------------------------------
	// Undocumented (i.e. non-exposed) functions for internal use only
	// ------------------------------------------------------------------------------------------------------------------

    this.createBody = function(bodyDef)
    {
        initialize();
        return this.world.createBody(bodyDef);
    };

    this.wadeToBox = function(position)
	{
		return ({x:position.x/scale,y:-1*position.y/scale});
	};

	this.wadeToBoxScalar = function(value)
	{
		return (value/scale);
	};

	this.boxToWade = function(position)
	{
		return ({x:position.x*scale, y:-1*position.y*scale});
	};

	this.boxToWadeScalar = function(value)
	{
		return (value*scale);
	};

    this.getScale = function()
    {
        return scale;
    };

};

/**
 * This is the object used to interact with the physics engine
 * @type {Wade_physics}
 */
wade.physics = new Wade_physics();
