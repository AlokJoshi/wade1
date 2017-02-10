/*
 * Comment from b2WorldContacts.js for b2ContactListener
 * Implement this class to get contact information. You can use
 * these results for things like sounds and game logic. You can
 * also get contact results by traversing the contact lists
 * after the time step. However, you might miss some contacts
 * because continuous physics leads to sub-stepping.
 * Additionally you may receive multiple callbacks for the same
 * contact in a single time step.
 * You should strive to make your callbacks efficient because
 * there may be many callbacks per time step.
 * warning You cannot create/destroy Box2D entities inside these
 * callbacks.
 */
wade.physics.collisions = new (function()
{
    var contactListener = null;

    this.init = function()
    {
        contactListener = new box2d.b2ContactListener();
        contactListener.BeginContact = function(contact)
        {
            var sceneObjectA = contact.GetFixtureA().GetBody().GetUserData().sceneObject;
            var sceneObjectB = contact.GetFixtureB().GetBody().GetUserData().sceneObject;
            var nameA = sceneObjectA.getName();
            var nameB = sceneObjectB.getName();
            if (nameB)
            {
                sceneObjectA.getBehavior('PhysicsObject').collidingWith[nameB] = true;
            }
            if (nameA)
            {
                sceneObjectB.getBehavior('PhysicsObject').collidingWith[nameA] = true;
            }
        };
        contactListener.EndContact = function(contact)
        {
            var sceneObjectA = contact.GetFixtureA().GetBody().GetUserData().sceneObject;
            var sceneObjectB = contact.GetFixtureB().GetBody().GetUserData().sceneObject;
            var nameA = sceneObjectA.getName();
            var nameB = sceneObjectB.getName();
            if (nameB)
            {
                sceneObjectA.getBehavior('PhysicsObject').collidingWith[nameB] = false;
            }
            if (nameA)
            {
                sceneObjectB.getBehavior('PhysicsObject').collidingWith[nameA] = false;
            }
        };
        contactListener.PreSolve = function(contact, manifold)
        {
            var sceneObjectA = contact.GetFixtureA().GetBody().GetUserData().sceneObject;
            var sceneObjectB = contact.GetFixtureB().GetBody().GetUserData().sceneObject;
            var cancelA = sceneObjectA.process('onCollision', {otherObject: sceneObjectB, contact: contact, manifold: manifold, bodyIndex: 'A'});
            var cancelB = sceneObjectB.process('onCollision', {otherObject: sceneObjectA, contact: contact, manifold: manifold, bodyIndex: 'B'});
            if (cancelA || cancelB)
            {
                contact.SetEnabled(false);
            }

        };
        var world = wade.physics.world.getB2DWorld();
        world.SetContactListener(contactListener);
    };
})();
