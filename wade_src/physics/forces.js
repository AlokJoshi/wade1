wade.physics.forces = new (function()
{
// Create an explosion effect in the box2d world. This creates particles to effect the explosion
    this.particleExplosion = function(position, parameters)
    {
        var options = wade.cloneObject(parameters);
        var startRadians = options.startRadians || 0;
        var endRadians = options.endRadians || 2*Math.PI;
        var radianStep = options.radianStep || 32;
        var particleSize = options.particleSize || 4;
        var particlePower = options.particlePower || 60;
        var particleDuration = options.particleDuration || 500;
        var particleSprite = options.particleSprite || 0;
        var particleLayer = options.particleLayer || wade.defaultLayer;
        var particlesArray = [];

        var bodyOptions = {
            bodyType: "dynamic",
            bodyFixedRotation: true,
            bodyBullet: true,
            bodyLinearDamping: 4,
            bodyGravityScale: 0,
            fData: {
                density: 60,
                friction: 0,
                restitution: 0.99,
                filterGroupIndex: -1,
                type: "circle"
            }
        };

        var range = endRadians - startRadians;
        for (var i =0; i<radianStep; i++)
        {
            var angle = (i/radianStep)*range+startRadians;
            var expVec = {x:particlePower * Math.sin(angle),y:particlePower* Math.cos(angle)};
            var boxVector = new box2d.b2Vec2(expVec.x,expVec.y);
            var expSprite = new Sprite(particleSprite,particleLayer);
            expSprite.setSize(particleSize,particleSize);
            var particle =  new SceneObject(expSprite, PhysicsObject ,position.x, position.y);
            wade.addSceneObject(particle,true,bodyOptions);
            particle.getBehavior().SetLinearVelocity(boxVector);
            particlesArray.push(particle);
        }

        var cleanup = function(arr)
        {
            while (arr.length > 0)
            {
                var o = arr.pop();
                wade.removeSceneObject(o);
            }
        };

        setTimeout(function() { cleanup(particlesArray)} ,particleDuration);
    };

    this.rayCastExplosion = function(position, parameters)
    {
        var world = wade.b2dPhysics.world.getB2DWorld();
        var options = wade.cloneObject(parameters);
        var centerPoint = wade.b2dPhysics.wadeToBox(position);
        var centerVec =  new box2d.b2Vec2(centerPoint.x,centerPoint.y);
        var startRadians = options.startRadians || 0;
        var endRadians = options.endRadians || 2*Math.PI;
        var radianStep = options.radianStep || 32;
        var blastRadius = wade.b2dPhysics.wadeToBoxScalar(options.blastRadius) || 10;

        var raycastCallback = function(fixture,point,normal,fraction)
        {
            return fraction;
        };


        var range = endRadians - startRadians;
        for (var i=0; i<radianStep; i++)
        {
            var angle = (i/radianStep)*range+startRadians;
            var expVec = {x:centerPoint.x + blastRadius * Math.sin(angle),y:centerPoint.y + blastRadius* Math.cos(angle)};
            world.RayCast(raycastCallback,centerVec,expVec);
        }
    };

})();
