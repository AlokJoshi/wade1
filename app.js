App = function(){
  this.load = function(){
      wade.loadImage('mole.png');
      wade.loadImage('holeTop.png');
      wade.loadImage('holeBottom.png');

  }
  this.init = function(){
      var sprite = new Sprite('mole.png',10);
      var mole= new SceneObject(sprite);
      wade.addSceneObject(mole);
      //mole.moveTo(-100,-100,200);

      var holeTopSprite = new Sprite('holeTop.png',20);
      var holeBottomSprite = new Sprite('holeBottom.png',5);
      var hole=new SceneObject([holeTopSprite,holeBottomSprite]);
      hole.setSpriteOffset(0,{x:0,y:-64});
      hole.setSpriteOffset(1,{x:0,y:64});

      wade.addSceneObject(hole);
      console.log(holeTopSprite);
  }
}
