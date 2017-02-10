function Layer(layerId, renderMode)
{
    this.id = layerId;

    this._sprites = [];
    this._movingSprites = [];
    this._transform = {scale: 1, translate: 1};
    this._sorting = 'none';
    this._dirtyAreas = [];
    this._needsFullRedraw = true;
    this._clearCanvas = true;
    this._smoothing = true;
    this._resolutionFactor = wade.getResolutionFactor();
    this._cameraPosition = wade.getCameraPosition();
    this._useQuadtree = true;
	this._renderMode = renderMode || 'webgl';
    if (this._renderMode == 'webgl' && !wade.isWebGlSupported())
	{
		this._renderMode = '2d';
		wade.log('WebGL is not supported in this environment, layer ' + layerId + ' is falling back to a canvas-based renderer.');
	}
    this._useOffScreenTarget = false;
	this._alwaysDrawSprites = [];
    this._updateScaleConversionFactor();
	
	// create float32 arrays for webgl rendering (if supported)
	try
	{
		this._f32ViewportSize = new Float32Array([0, 0]);
		this._f32CameraScaleTranslateTime = new Float32Array([0, 0, 0, 0]);
	}
	catch (e) {}
    // create primary canvas and get its context
    this.createCanvas();

    // create secondary canvas and get its context
    wade.isDoubleBufferingEnabled() && this.createSecondaryCanvas();
	
    // set the world bounds to be the same as the screen size initially
    var halfWidth = wade.getScreenWidth() / 2;
    var halfHeight = wade.getScreenHeight() / 2;
    this._worldBounds = {minX: -halfWidth, minY: -halfHeight, maxX: halfWidth, maxY: halfHeight};

    // initialise the quad tree
    this._initQuadTree();

    // check to see if this is the android stock browser, in which case we have to work around some browser bugs
    this._isAndroidStockBrowser = (navigator.userAgent.indexOf("Android") >= 0 && navigator.userAgent.indexOf("Firefox") == -1  && !(window.chrome && window.chrome.app) && !wade.isWebGlSupported());
}

Layer.prototype.getScaleFactor = function()
{
    return this._transform.scale;
};

Layer.prototype.getTranslateFactor = function()
{
    return this._transform.translate;
};

Layer.prototype.setTransform = function(scale, translate)
{
    this._transform.scale = scale;
    this._transform.translate = translate;
    this._updateScaleConversionFactor();
    this._needsFullRedraw = true;
};

Layer.prototype.getSorting = function()
{
    return this._sorting;
};

Layer.prototype.setSorting = function(sorting)
{
    if (sorting != this._sorting)
    {
        this._sorting = sorting;
        switch(sorting)
        {
            case 'bottomToTop':
                this._sortingFunction = this._spriteSorter_bottomToTop;
                break;
            case 'topToBottom':
                this._sortingFunction = this._spriteSorter_topToBottom;
                break;
            case 'none':
                this._sortingFunction = 0;
                break;
            default:
                this._sortingFunction = sorting;
                break;
        }
        this._needsFullSorting = true;
    }
};

Layer.prototype.clearDirtyAreas = function()
{
    this._dirtyAreas.length = 0;
    this._needsFullRedraw = false;
};

Layer.prototype.addDirtyArea = function(area)
{
    this._dirtyAreas.push({minX: area.minX, maxX: area.maxX, minY: area.minY, maxY: area.maxY});
};

Layer.prototype.addAlwaysDrawSprite = function(sprite)
{
	this._alwaysDrawSprites.push(sprite);
};

Layer.prototype.removeAlwaysDrawSprite = function(sprite)
{
	wade.removeObjectFromArray(sprite, this._alwaysDrawSprites);
};

Layer.prototype.addSprite = function(sprite)
{
    // add the sprite to the array of sprites
    this._sprites.push(sprite);

    // generate and set an id for it
    sprite.id = this._sprites.length;

    // update world bounds
    wade.expandBox(this._worldBounds, sprite.boundingBox);

    // add the sprite to the quad tree
    if (this._useQuadtree)
    {
        // mark the area occupied by the new sprite as dirty
        this.addDirtyArea(sprite.boundingBox);
        this._addSpriteToQuadTree(sprite);
    }

	// check if it's an always-draw sprite
	if (sprite.isAlwaysDrawing())
	{
		this.addAlwaysDrawSprite(sprite);
	}

	// we need to do a full sort the next time we draw
	// insertion sort is probably faster but complicated as we may be inserting multiple sprites out of order in one step
    this._needsFullSorting = true;
};

Layer.prototype.getSpriteCount = function()
{
    return this._sprites.length + this._alwaysDrawSprites.length;
};

Layer.prototype.removeSprite = function(sprite)
{
    wade.removeObjectFromArray(sprite, this._sprites);
    if (this._useQuadtree && sprite.quadTreeNode)
    {
        this.addDirtyArea(sprite.boundingBox);
        sprite.quadTreeNode.removeObject(sprite);
        sprite.quadTreeNode = 0;
    }
	if (sprite.isAlwaysDrawing())
	{
		this.removeAlwaysDrawSprite(sprite);
	}
};

Layer.prototype.draw = function()
{
    var i, j, k;

    // don't do anything if nothing has changed in this layer
    if (!this._canvas || (this._dirtyAreas.length == 0 && !this._needsFullRedraw && this._useQuadtree && !this._alwaysDrawSprites.length))
    {
        return;
    }

    if ((this._isAndroidStockBrowser && this._clearCanvas) || (!this._useOffScreenTarget && this._renderMode == 'webgl'))
    {
        this._needsFullRedraw = true;
    }

	// if the render mode is set to webgl, make sure we can support it, or fall back to 2d canvas
	if (this._renderMode == 'webgl' && !wade.isWebGlSupported())
	{
		this._renderMode = '2d';
	}

    // choose a context
    var useSecondaryContext = this._needsFullRedraw && this._renderMode == '2d' && wade.isDoubleBufferingEnabled();
    var context = useSecondaryContext? this._secondaryContext : this._context;
    this._needsFlipping = useSecondaryContext;

    // precalculate some useful variables
    var canvasWidth = wade.getScreenWidth() * this._resolutionFactor;
    var canvasHeight = wade.getScreenHeight() * this._resolutionFactor;
    var halfCanvasWidth = canvasWidth /  2;
    var halfCanvasHeight = canvasHeight / 2;

    // sort the sprites
    if (this._sorting != 'none')
    {
        // if the number of moving sprites if greater than the square root of the total sprites, we need a full sort
        // this is because the sorting algorithm below that sorts moving sprites individually is O(N^2), the full sort is presumably O(N*logN)
        this._needsFullSorting = this._needsFullSorting || this._movingSprites.length * this._movingSprites.length > this._sprites.length;
        if (this._needsFullSorting)
        {
            this._sprites.sort(this._sortingFunction);
        }
        else
        {
            for (i=0; i<this._movingSprites.length; i++)
            {
                var numSwaps = 0;
                var movingSprite = this._movingSprites[i];
                for (j=0; j<this._sprites.length; j++)
                {
                    if (movingSprite == this._sprites[j])
                    {
                        break;
                    }
                }
                if (j < this._sprites.length)
                {
                    for (k=j+1; k<this._sprites.length; k++)
                    {
                        if (this._sortingFunction(movingSprite, this._sprites[k]) > 0)
                        {
                            this._sprites[k].setDirtyArea();
                            this._sprites[k-1] = this._sprites[k];
                            this._sprites[k] = movingSprite;
                            numSwaps++;
                        }
                        else
                        {
                            break;
                        }
                    }
                    if (!numSwaps)
                    {
                        for (k=j-1; k>=0; k--)
                        {
                            if (this._sortingFunction(movingSprite, this._sprites[k]) < 0)
                            {
                                this._sprites[k].setDirtyArea();
                                this._sprites[k+1] = this._sprites[k];
                                this._sprites[k] = movingSprite;
                                numSwaps++;
                            }
                            else
                            {
                                break;
                            }
                        }
                    }
                }
            }
        }
    }
    this._needsFullSorting = false;

    // reset the array of moving sprites
    this._movingSprites.length = 0;

    // choose appropriate draw function name depending on render mode
	var drawFunc = (this._renderMode == 'webgl')? 'draw_gl' : 'draw';
	
	// if in webgl mode, set a framebuffer to render to
	if (this._renderMode == 'webgl' && this._useOffScreenTarget)
	{
		context.bindFramebuffer(context.FRAMEBUFFER, context.mainRenderTarget);
	}
		
	// are we using a quadtree for this layer?
    if (this._useQuadtree)
    {
        // if the layer needs a full redraw, update the transform on the context object
        var dirtyArea;
        var canvasInWorldSpace = this.canvasBoxToWorld({minX: -halfCanvasWidth, minY: -halfCanvasHeight, maxX: halfCanvasWidth, maxY: halfCanvasHeight});
        if (this._needsFullRedraw)
        {
			// calculate camera transform
			var s = this._scaleConversionFactor;
			var tx = halfCanvasWidth - this._cameraPosition.x * this._transform.translate * s;
			var ty = halfCanvasHeight - this._cameraPosition.y * this._transform.translate * s;

			if (this._renderMode == '2d')
			{
				// restore context
				context.restore();

				// save context
				context.save();

				// set camera transform
				context.setTransform(s, 0, 0, s, Math.round(tx), Math.round(ty));
			}
			else if (this._renderMode == 'webgl')
			{
				// set camera transform
				this._f32CameraScaleTranslateTime[0] = s;
				this._f32CameraScaleTranslateTime[1] = this._cameraPosition.x * this._transform.translate * s;
				this._f32CameraScaleTranslateTime[2] = this._cameraPosition.y * this._transform.translate * s;
				this._f32CameraScaleTranslateTime[3] = wade.getAppTime();
				context.uniform4fv(context.currentShader.uniforms['uCameraScaleTranslateTime'], this._f32CameraScaleTranslateTime);
			}
			
			// set the dirty area to be the whole world-space area occupied by the canvas
            dirtyArea = wade.cloneObject(canvasInWorldSpace);
        }
        else
        {
            // calculate the area that needs redrawing
            dirtyArea = this._joinDirtyAreas();
        }

        // don't do anything if the dirty area doesn't exist (it can happen if it's off-screen or zero-sized)
        if (!dirtyArea)
        {
            this.clearDirtyAreas();
            return;
        }

        // clear the 'needsDrawing' flag on each sprite
        for (k=0; k<this._sprites.length; k++)
        {
            this._sprites[k].needsDrawing = 0;
        }

        var oldArea = 0;
        while (oldArea.minX != dirtyArea.minX || oldArea.minY != dirtyArea.minY || oldArea.maxX != dirtyArea.maxX || oldArea.maxY != dirtyArea.maxY)
        {
            // make sure the coordinates of the dirty area are valid, or we'll be stuck in this loop forever
            if (isNaN(dirtyArea.minX) || isNaN(dirtyArea.minY) || isNaN(dirtyArea.maxX) || isNaN(dirtyArea.maxY))
            {
                wade.log("Warning: some sprites have invalid coordinates, it isn't possible to render this frame");
                return;
            }

            // ask the quadtree to flag the sprites that need drawing
            this._quadTree.flagObjects(dirtyArea, 'needsDrawing');

            // if this isn't a full redraw, we need to expand the dirty area to include all overlapping sprites (and sprites overlapping the overlapping sprites, etc.)
            oldArea = wade.cloneObject(dirtyArea);
            for (j=0; j<this._sprites.length; j++)
            {
                if (this._sprites[j].needsDrawing && this._sprites[j].isVisible())
                {
                    wade.expandBox(dirtyArea, this._sprites[j].boundingBox);
                }
            }
            wade.clampBoxToBox(dirtyArea, canvasInWorldSpace);
        }

        // clear the dirty area of the canvas
        if (this._clearCanvas)
        {
            var canvasArea;
			if (this._renderMode == '2d')
			{
				context.save();
				context.setTransform(1,0,0,1,0,0);
				if (this._needsFullRedraw)
				{
					context.clearRect(0, 0, Math.round(canvasWidth), Math.round(canvasHeight));
				}
				else
				{
					// calculate a bounding box of all the sprites that need drawing and clear it
					canvasArea = this.worldBoxToCanvas(dirtyArea);
					context.clearRect(Math.floor(canvasArea.minX + halfCanvasWidth - 1), Math.floor(canvasArea.minY + halfCanvasHeight - 1), Math.ceil(canvasArea.maxX - canvasArea.minX + 2), Math.ceil(canvasArea.maxY - canvasArea.minY + 2));
				}
				context.restore();
			}
			else if (this._renderMode == 'webgl')
			{
				if (this._needsFullRedraw)
				{
					context.clear(context.COLOR_BUFFER_BIT);
				}
				else
				{
					// calculate a bounding box of all the sprites that need drawing and clear it
					canvasArea = this.worldBoxToCanvas(dirtyArea);
					context.enable(context.SCISSOR_TEST);
					context.scissor(Math.floor(canvasArea.minX + halfCanvasWidth - 1), canvasHeight - Math.floor(canvasArea.minY + halfCanvasHeight-1) - Math.ceil(canvasArea.maxY - canvasArea.minY + 2), Math.ceil(canvasArea.maxX - canvasArea.minX + 2), Math.ceil(canvasArea.maxY - canvasArea.minY + 2));
					context.clear(context.COLOR_BUFFER_BIT);
					context.disable(context.SCISSOR_TEST);
				}
			}
        }

        // remove dirty areas
        this.clearDirtyAreas();

        // draw the sprites that need drawing
        for (i=0; i<this._sprites.length; i++)
        {
            if (this._sprites[i].needsDrawing)
            {
				this._sprites[i][drawFunc](context);
            }
        }
    }
    else // no quadtree, just draw everything
    {
		// calculate camera transform
		s = this._scaleConversionFactor;
		tx = halfCanvasWidth - this._cameraPosition.x * this._transform.translate * s;
		ty = halfCanvasHeight - this._cameraPosition.y * this._transform.translate * s;

		if (this._renderMode == 'webgl')
		{
			// clear
			context.clear(context.COLOR_BUFFER_BIT);
			
			// set camera transform
			this._f32CameraScaleTranslateTime[0] = s;
			this._f32CameraScaleTranslateTime[1] = this._cameraPosition.x * this._transform.translate * s;
			this._f32CameraScaleTranslateTime[2] = this._cameraPosition.y * this._transform.translate * s;
			context.uniform4fv(context.currentShader.uniforms['uCameraScaleTranslateTime'], this._f32CameraScaleTranslateTime);
		}
		else if (this._renderMode == '2d')
		{
			// clear
			context.save();
			context.setTransform(1,0,0,1,0,0);
			context.clearRect(0, 0, Math.round(canvasWidth), Math.round(canvasHeight));
			context.restore();
			
			// set camera transform
			context.setTransform(s, 0, 0, s, Math.round(tx), Math.round(ty));
		}

        // remove dirty areas
        this.clearDirtyAreas();

        for (i=0; i<this._sprites.length; i++)
        {
            this._sprites[i][drawFunc](context);
        }
    }
	
	// if we are in webgl mode, do a post-render step to draw the framebuffer onto the screen
	if (this._renderMode == 'webgl' && this._useOffScreenTarget)
	{
		context.setShaderProgram(context.defaultShaderProgram);
        context.blendFuncSeparate(context.ONE, context.ONE_MINUS_SRC_ALPHA, context.ONE, context.ONE_MINUS_SRC_ALPHA);
        context.pixelStorei(context.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        this._f32CameraScaleTranslateTime[0] = 1;
		this._f32CameraScaleTranslateTime[1] = 0;
		this._f32CameraScaleTranslateTime[2] = 0;
		this._f32CameraScaleTranslateTime[3] = wade.getAppTime();
		context.bindFramebuffer(context.FRAMEBUFFER, null);
        if (canvasArea)
        {
            context.enable(context.SCISSOR_TEST);
            context.scissor(Math.floor(canvasArea.minX + halfCanvasWidth - 1), canvasHeight - Math.floor(canvasArea.minY + halfCanvasHeight-1) - Math.ceil(canvasArea.maxY - canvasArea.minY + 2), Math.ceil(canvasArea.maxX - canvasArea.minX + 2), Math.ceil(canvasArea.maxY - canvasArea.minY + 2));
            context.clear(context.COLOR_BUFFER_BIT);
            context.disable(context.SCISSOR_TEST);
        }
        else if (this._clearCanvas)
        {
            context.clear(context.COLOR_BUFFER_BIT);
        }
		context.uniform4fv(context.currentShader.uniforms['uCameraScaleTranslateTime'], this._f32CameraScaleTranslateTime);
		context.uniform4fv(context.currentShader.uniforms['uPositionAndSize'], context.mainRenderTarget.uniformValues.positionAndSize);
        context.uniform4fv(context.currentShader.uniforms['uAnimFrameInfo'], context.mainRenderTarget.uniformValues.animFrameInfo);
        context.uniform4fv(context.currentShader.uniforms['uImageArea'], context.mainRenderTarget.uniformValues.imageArea);
        context.uniform2fv(context.currentShader.uniforms['uRotationAlpha'], context.mainRenderTarget.uniformValues.rotationAlpha);
		context.bindTexture(context.TEXTURE_2D, context.mainRenderTarget.texture);
		context.drawArrays(context.TRIANGLE_STRIP, 0, 4);
		s = this._scaleConversionFactor;
		this._f32CameraScaleTranslateTime[0] = s;
		this._f32CameraScaleTranslateTime[1] = this._cameraPosition.x * this._transform.translate * s;
		this._f32CameraScaleTranslateTime[2] = this._cameraPosition.y * this._transform.translate * s;
		context.uniform4fv(context.currentShader.uniforms['uCameraScaleTranslateTime'], this._f32CameraScaleTranslateTime);
		context.bindTexture(context.TEXTURE_2D, null);
		context.currentImage[0] = null;
        context.pixelStorei(context.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        context.blendFuncSeparate(context.SRC_ALPHA, context.ONE_MINUS_SRC_ALPHA, context.ONE, context.ONE_MINUS_SRC_ALPHA);
    }
};

Layer.prototype.sort = function(sortingFunction)
{
    this._sprites.sort(sortingFunction || this._sortingFunction);
    this._needsFullRedraw = true;
};

Layer.prototype.onCameraPositionChanged = function(cameraPosition)
{
    // force a full redraw if the camera x or y has changed and we have a non-zero translate factor, or z has changed and we have a non-zero scale factor
    if ((this._transform.translate != 0 &&  (cameraPosition.x != this._cameraPosition.x || cameraPosition.y != this._cameraPosition.y)) ||
        (this._transform.scale != 0 && cameraPosition.z != this._cameraPosition.z))
    {
        this._needsFullRedraw = true;
    }
    // update camera values
    this._cameraPosition = {x: cameraPosition.x, y: cameraPosition.y, z: cameraPosition.z};
    this._updateScaleConversionFactor();
};

Layer.prototype.onSpritePositionChanged = function(sprite)
{
    // update the quadtree
    if (this._useQuadtree && sprite.quadTreeNode)
    {
        wade.expandBox(this._worldBounds, sprite.boundingBox);
        sprite.quadTreeNode.removeObject(sprite);
        this._addSpriteToQuadTree(sprite);
    }
    this._movingSprites.push(sprite);
};

Layer.prototype.worldPositionToScreen = function(position)
{
    return {x: this._scaleConversionFactor * (position.x  - this._cameraPosition.x * this._transform.translate) / this._resolutionFactor,
            y: this._scaleConversionFactor * (position.y  - this._cameraPosition.y * this._transform.translate) / this._resolutionFactor};
};

Layer.prototype.worldDirectionToScreen = function(direction)
{
    return {x: this._scaleConversionFactor * direction.x / this._resolutionFactor,
            y: this._scaleConversionFactor * direction.y / this._resolutionFactor};
};

Layer.prototype.worldBoxToScreen = function(box)
{
    var worldHalfSize = {x: (box.maxX - box.minX) / 2, y: (box.maxY - box.minY) / 2};
    var worldPosition = {x: box.minX + worldHalfSize.x, y: box.minY + worldHalfSize.y};
    var screenPosition = this.worldPositionToScreen(worldPosition);
    var screenHalfSize = this.worldDirectionToScreen(worldHalfSize);
    return {minX: screenPosition.x - screenHalfSize.x,
            minY: screenPosition.y - screenHalfSize.y,
            maxX: screenPosition.x + screenHalfSize.x,
            maxY: screenPosition.y + screenHalfSize.y};
};

Layer.prototype.worldUnitToScreen = function()
{
    return this._scaleConversionFactor / this._resolutionFactor;
};

Layer.prototype.screenPositionToWorld = function(screenPosition)
{
    return {x: this._cameraPosition.x * this._transform.translate + screenPosition.x * this._resolutionFactor / this._scaleConversionFactor,
            y: this._cameraPosition.y * this._transform.translate + screenPosition.y * this._resolutionFactor / this._scaleConversionFactor};
};

Layer.prototype.screenDirectionToWorld = function(screenDirection)
{
    return {x: screenDirection.x * this._resolutionFactor / this._scaleConversionFactor,
            y: screenDirection.y * this._resolutionFactor / this._scaleConversionFactor};
};

Layer.prototype.screenBoxToWorld = function(box)
{
    var screenHalfSize = {x: (box.maxX - box.minX) / 2, y: (box.maxY - box.minY) / 2};
    var screenPosition = {x: box.minX + screenHalfSize.x, y: box.minY + screenHalfSize.y};
    var worldPosition = this.screenPositionToWorld(screenPosition);
    var worldHalfSize = this.screenDirectionToWorld(screenHalfSize);
    return {minX: worldPosition.x - worldHalfSize.x,
            minY: worldPosition.y - worldHalfSize.y,
            maxX: worldPosition.x + worldHalfSize.x,
            maxY: worldPosition.y + worldHalfSize.y};
};

Layer.prototype.screenUnitToWorld = function()
{
    return this._resolutionFactor / this._scaleConversionFactor;
};

Layer.prototype.worldPositionToCanvas = function(position)
{
    return {x: this._scaleConversionFactor * (position.x  - this._cameraPosition.x * this._transform.translate),
        y: this._scaleConversionFactor * (position.y  - this._cameraPosition.y * this._transform.translate)};
};

Layer.prototype.worldDirectionToCanvas = function(direction)
{
    return {x: this._scaleConversionFactor * direction.x,
        y: this._scaleConversionFactor * direction.y};
};

Layer.prototype.worldBoxToCanvas = function(box)
{
    var worldHalfSize = {x: (box.maxX - box.minX) / 2, y: (box.maxY - box.minY) / 2};
    var worldPosition = {x: box.minX + worldHalfSize.x, y: box.minY + worldHalfSize.y};
    var canvasPosition = this.worldPositionToCanvas(worldPosition);
    var canvasHalfSize = this.worldDirectionToCanvas(worldHalfSize);
    return {minX: canvasPosition.x - canvasHalfSize.x,
            minY: canvasPosition.y - canvasHalfSize.y,
            maxX: canvasPosition.x + canvasHalfSize.x,
            maxY: canvasPosition.y + canvasHalfSize.y};
};

Layer.prototype.worldUnitToCanvas = function()
{
    return this._scaleConversionFactor;
};

Layer.prototype.canvasPositionToWorld = function(canvasPosition)
{
    return {x: this._cameraPosition.x * this._transform.translate + canvasPosition.x / this._scaleConversionFactor,
        y: this._cameraPosition.y * this._transform.translate + canvasPosition.y / this._scaleConversionFactor};
};

Layer.prototype.canvasDirectionToWorld = function(canvasDirection)
{
    return {x: canvasDirection.x / this._scaleConversionFactor,
        y: canvasDirection.y / this._scaleConversionFactor};
};

Layer.prototype.canvasBoxToWorld = function(box)
{
    var canvasHalfSize = {x: (box.maxX - box.minX) / 2, y: (box.maxY - box.minY) / 2};
    var canvasPosition = {x: box.minX + canvasHalfSize.x, y: box.minY + canvasHalfSize.y};
    var worldPosition = this.canvasPositionToWorld(canvasPosition);
    var worldHalfSize = this.canvasDirectionToWorld(canvasHalfSize);
    return {minX: worldPosition.x - worldHalfSize.x,
        minY: worldPosition.y - worldHalfSize.y,
        maxX: worldPosition.x + worldHalfSize.x,
        maxY: worldPosition.y + worldHalfSize.y};
};

Layer.prototype.canvasUnitToWorld = function()
{
    return 1 / this._scaleConversionFactor;
};

Layer.prototype.resize = function(screenWidth, screenHeight)
{
    if (this._canvas)
    {
        this._canvas.width = Math.round(screenWidth * this._resolutionFactor);
        this._canvas.height = Math.round(screenHeight * this._resolutionFactor);
		if (this._renderMode == 'webgl')
		{
			this._f32ViewportSize[0] = this._canvas.width;
			this._f32ViewportSize[1] = this._canvas.height;
			this._context.viewport(0, 0, this._canvas.width, this._canvas.height);
			this._context.uniform2fv(this._context.currentShader.uniforms['uViewportSize'], this._f32ViewportSize);
            if (this._useOffScreenTarget)
            {
                this._context.mainRenderTarget.uniformValues.positionAndSize[2] = this._canvas.width;
                this._context.mainRenderTarget.uniformValues.positionAndSize[3] = this._canvas.height;
                this._context.bindTexture(this._context.TEXTURE_2D, this._context.mainRenderTarget.texture);
                this._context.texImage2D(this._context.TEXTURE_2D, 0, this._context.RGBA, this._canvas.width, this._canvas.height, 0, this._context.RGBA, this._context.UNSIGNED_BYTE, null);
                this._context.bindTexture(this._context.TEXTURE_2D, null);
            }
			this._context.currentImage = [];
		}
    }
    if (this._secondaryCanvas)
    {
        this._secondaryCanvas.width = Math.round(screenWidth * this._resolutionFactor);
        this._secondaryCanvas.height = Math.round(screenHeight * this._resolutionFactor);
    }
    this._needsFullRedraw = true;

    // context properties will be lost at this point, so if we had smoothing disabled, re-disable it
    if (!this._smoothing)
    {
        this._smoothing = true;
        this.setSmoothing(false);
    }
};

Layer.prototype.setCanvasClearing = function(toggle)
{
    this._clearCanvas = toggle;
};

Layer.prototype.getContext = function()
{
    return this._context;
};

Layer.prototype.bringSpriteToFront = function(sprite)
{
    sprite.setDirtyArea();
    wade.removeObjectFromArray(sprite, this._sprites);
    this._sprites.push(sprite);
};

Layer.prototype.pushSpriteToBack = function(sprite)
{
    sprite.setDirtyArea();
    wade.removeObjectFromArray(sprite, this._sprites);
    this._sprites.splice(0, 0, sprite);
};

Layer.prototype.putSpriteBehindSprite = function(sprite, otherSprite)
{
    var index = this._sprites.indexOf(otherSprite);
    wade.removeObjectFromArray(sprite, this._sprites);
    this._sprites.splice(index, 0, sprite);
};

Layer.prototype.flipIfNeeded = function()
{
    if (this._needsFlipping && this._renderMode == '2d')
    {
        var canvas = this._canvas;
        var context = this._context;
        this._canvas = this._secondaryCanvas;
        this._context = this._secondaryContext;
        this._secondaryCanvas = canvas;
        this._secondaryContext = context;
        this._canvas.style.display = 'inline';
        this._secondaryCanvas.style.display = 'none';
        this._needsFlipping = false;
    }
};

Layer.prototype.setCanvasStyleSize = function(width, height)
{
    if (!this._canvas)
    {
        return;
    }
    if (width != this._canvas.style.width || height != this._canvas.style.height)
    {
        this._canvas.style.width = width;
        this._canvas.style.height = height;
        if (this._secondaryCanvas)
        {
            this._secondaryCanvas.style.width = width;
            this._secondaryCanvas.style.height = height;
        }
    }
};

Layer.prototype.compareSprites = function(spriteA, spriteB)
{
    if (this._sortingFunction)
    {
        return this._sortingFunction(spriteA, spriteB);
    }
    else
    {
        return spriteA.id - spriteB.id;
    }
};

Layer.prototype.removeCanvases = function()
{
    if (this._canvas)
    {
        document.getElementById(wade.getContainerName()).removeChild(this._canvas);
        if (this._context && this._context.isWebGl)
        {
            resetContext(this._context);
            var loseContext = this._context.getExtension('WEBGL_lose_context');
            loseContext && loseContext.loseContext();
        }
    }
    this._context = null;
    this._canvas = null;
    this.removeSecondaryCanvas();
};

Layer.prototype.createCanvas = function()
{
    if (!this._canvas)
    {
        this._canvas = wade.createCanvas(this._resolutionFactor);
        this._canvas.id = 'wade_layer_' + this.id;
        this._canvas.style.zIndex = -this.id;
		if (this._renderMode != '2d')
		{
			try
			{
				this._context = this._canvas.getContext('webgl') || this._canvas.getContext('experimental-webgl');
                this._context.isWebGl = true;
			}
			catch (e) {}
			if (!this._context)
			{
				wade.log("Unable to use WebGL in this browser, falling back to 2d canvas");
			}
			else
			{
				this._setupWebGl(this._context, this._canvas);
			}
		}
		if (!this._context || this._renderMode == '2d')
		{
			this._context = this._canvas.getContext('2d');
		}
        else
        {
            this._renderMode = 'webgl';
        }
		this._context['imageSmoothingEnabled'] = this._context['mozImageSmoothingEnabled'] = this._context['msImageSmoothingEnabled'] = this._context['oImageSmoothingEnabled'] = this._smoothing;
        (this._renderMode == '2d') && this._context.save();
        this._needsFullRedraw = true;
    }
};

Layer.prototype.getCanvas = function()
{
    return this._canvas;
};

Layer.prototype._updateScaleConversionFactor = function()
{
    var cameraPosition = wade.getCameraPosition();
    this._scaleConversionFactor = (this._transform.scale / cameraPosition.z + 1 - this._transform.scale) * this._resolutionFactor;
};

Layer.prototype._spriteSorter_bottomToTop = function(spriteA, spriteB)
{
    var delta = spriteA.getPosition().y + spriteA.getSortPoint().y * spriteA.getSize().y - spriteB.getPosition().y - spriteB.getSortPoint().y * spriteB.getSize().y;
    return (Math.abs(delta) < wade.c_epsilon)? spriteA.id - spriteB.id : delta;
};

Layer.prototype._spriteSorter_topToBottom = function(spriteA, spriteB)
{
    var delta = spriteB.getPosition().y + spriteB.getSortPoint().y * spriteB.getSize().y - spriteA.getPosition().y - spriteA.getSortPoint().y * spriteA.getSize().y;
    return (Math.abs(delta) < wade.c_epsilon)? spriteA.id - spriteB.id : delta;
};

Layer.prototype._initQuadTree = function()
{
    // make the quad tree a bit bigger than the layer's world bounds (so if objects move a bit, we don't have to re-init immediately)
    var scale = 1.5;
    var halfSizeX = (this._worldBounds.maxX - this._worldBounds.minX) / 2;
    var halfSizeY = (this._worldBounds.maxY - this._worldBounds.minY) / 2;
    var centerX = this._worldBounds.minX + halfSizeX;
    var centerY = this._worldBounds.minY + halfSizeY;

    this._quadTree = new QuadTreeNode(0, centerX - halfSizeX * scale, centerY - halfSizeY * scale, centerX + halfSizeX * scale, centerY + halfSizeY * scale);
};

Layer.prototype._addSpriteToQuadTree = function(sprite)
{
    // make sure that the quadtree contains the layer's world bounds
    if (!wade.boxContainsBox(this._quadTree, this._worldBounds))
    {
        // if it doesn't, we need to expand the quadtree and rebuild it
        this._initQuadTree();

        // re-add all the sprites to the quadtree
        for (var i=0; i<this._sprites.length; i++)
        {
            this._quadTree.addObject(this._sprites[i]);
        }
    }
    else
    {
        this._quadTree.addObject(sprite);
    }
};

Layer.prototype._joinDirtyAreas = function()
{
    // if we have no dirty areas, return a zero-sized rectangle
    if (!this._dirtyAreas.length)
    {
        return {minX: 0, minY: 0, maxX: 0, maxY: 0};
    }

    // precalculate variables and default result
    var halfWidth = wade.getScreenWidth() / 2;
    var halfHeight = wade.getScreenHeight() / 2;
    var screen = this.screenBoxToWorld({minX: -halfWidth, minY: -halfHeight, maxX: halfWidth, maxY: halfHeight});
    var result = {minX: screen.maxX, minY: screen.maxY, maxX: screen.minX, maxY: screen.minY};

    // calculate a bounding box that encompasses all dirty areas that are on the screen
    for (var i=0; i<this._dirtyAreas.length; i++)
    {
        var area = this._dirtyAreas[i];
        if (wade.boxIntersectsBox(screen, area))
        {
            wade.expandBox(result, area);
        }
    }

    // clamp the resulting area to the screen
    wade.clampBoxToBox(result, screen);

    // avoid negative width and height
    if (result.maxX <= result.minX || result.maxY <= result.minY)
    {
        result = 0;
    }
    return result;
};

Layer.prototype.createSecondaryCanvas = function()
{
	if (!this._secondaryCanvas)
	{
		this._secondaryCanvas = wade.createCanvas(this._resolutionFactor);
		this._secondaryCanvas.id = 'wade_layer_' + this.id + '_backBuffer';
		this._secondaryCanvas.style.zIndex = -this.id;
		this._secondaryCanvas.style.display = 'none';
        this._secondaryContext = this._secondaryCanvas.getContext('2d');
		this._secondaryContext['imageSmoothingEnabled'] = this._secondaryContext['mozImageSmoothingEnabled'] = this._secondaryContext['msImageSmoothingEnabled'] = this._secondaryContext['oImageSmoothingEnabled'] = this._smoothing;
		this._secondaryContext.save();
	}
};

Layer.prototype.removeSecondaryCanvas = function()
{
    if (this._secondaryCanvas)
    {
        document.getElementById(wade.getContainerName()).removeChild(this._secondaryCanvas);
        if (this._secondaryContext && this._secondaryContext.isWebGl)
        {
            resetContext(this._secondaryContext);
            var loseContext = this._secondaryContext.getExtension('WEBGL_lose_context');
            loseContext && loseContext.loseContext();
        }
    }
    this._secondaryContext= null;
    this._secondaryCanvas = null;
};

Layer.prototype.setResolutionFactor = function(resolutionFactor)
{
    if (resolutionFactor != this._resolutionFactor)
    {
        this._resolutionFactor = resolutionFactor;
        this._updateScaleConversionFactor();
        this.resize(wade.getScreenWidth(), wade.getScreenHeight());
    }
};

Layer.prototype.getResolutionFactor = function()
{
    return this._resolutionFactor;
};

Layer.prototype.setSmoothing = function(toggle)
{
    if (toggle != this._smoothing)
    {
        this._smoothing = toggle;
        this._context.restore();
        this._context['imageSmoothingEnabled'] = this._context['mozImageSmoothingEnabled'] = this._context['msImageSmoothingEnabled'] = this._context['oImageSmoothingEnabled'] = toggle;
        this._context.save();
        if (this._secondaryContext)
        {
            this._secondaryContext.restore();
            this._secondaryContext['imageSmoothingEnabled'] = this._secondaryContext['mozImageSmoothingEnabled'] = this._secondaryContext['msImageSmoothingEnabled'] = this._secondaryContext['oImageSmoothingEnabled'] = toggle;
            this._secondaryContext.save();
        }
        this._needsFullRedraw = true;
    }
};

Layer.prototype.getSmoothing = function()
{
    return this._smoothing;
};

Layer.prototype.addSpritesInAreaToArray = function(area, array, sorted)
{
    if (sorted && this._sortingFunction)
    {
        var tempArray = [];
        this._quadTree.addObjectsInAreaToArray(area, tempArray);
        tempArray.sort(this._sortingFunction);
        for (var i=tempArray.length-1; i>=0; i--)
        {
            array.push(tempArray[i]);
        }
    }
    else
    {
        this._quadTree.addObjectsInAreaToArray(area, array);
    }
};

Layer.prototype.toDataURL = function()
{
    return this._canvas.toDataURL();
};

Layer.prototype.forceRedraw = function()
{
    this._needsFullRedraw = true;
};

Layer.prototype.setOpacity = function(opacity)
{
    this._canvas.style.opacity = opacity;
    this._secondaryCanvas && (this._secondaryCanvas.style.opacity = opacity);
};

Layer.prototype.getOpacity = function()
{
    return this._canvas.style.opacity;
};

Layer.prototype.clear = function()
{
    var screenWidth = wade.getScreenWidth() * this._resolutionFactor;
    var screenHeight = wade.getScreenHeight() * this._resolutionFactor;
    var context = this._context;
	if (this._renderMode == 'webgl')
	{
		this._context.clear(this._context.COLOR_BUFFER_BIT);
		this._secondaryContext && this._secondaryContext.clear(this._secondaryContext.COLOR_BUFFER_BIT);
	}
	else
	{
		context.save();
		context.setTransform(1,0,0,1,0,0);
		context.clearRect(0, 0, Math.round(screenWidth), Math.round(screenHeight));
		context.restore();
		if (this._secondaryContext)
		{
			context = this._secondaryContext;
			context.save();
			context.setTransform(1,0,0,1,0,0);
			context.clearRect(0, 0, Math.round(screenWidth), Math.round(screenHeight));
			context.restore();
		}
	}
};

Layer.prototype.useQuadtree = function(toggle)
{
    if (toggle != this._useQuadtree)
    {
        this._useQuadtree = toggle;
        if (this._useQuadtree)
        {
            this._quadTree.empty();
            for (var i=0; i<this._sprites.length; i++)
            {
                this._addSpriteToQuadTree(this._sprites[i]);
            }
        }
    }
};

Layer.prototype.isUsingQuadtree = function()
{
    return this._useQuadtree;
};

Layer.prototype.set3DTransform = function(transformString, transformOrigin, time, callback)
{
    var setOnElement = function(c)
    {
        if (time)
        {
            c.style['MozTransition'] = '-moz-transform ' + time + 's';
            c.style['msTransition'] = '-ms-transform ' + time + 's';
            c.style['OTransition'] = '-O-transform ' + time + 's';
            c.style['WebkitTransition'] = '-webkit-transform ' + time + 's';
            c.style['transition'] = 'transform ' + time + 's';
            var f = function()
            {
                callback && callback();
                callback = null;
                c.removeEventListener('transitionend', f);
            };
            c.addEventListener('transitionend', f, true);
        }
        else
        {
            c.style['MozTransition'] = '-moz-transform 0';
            c.style['msTransition'] = '-ms-transform 0';
            c.style['OTransition'] = '-O-transform 0';
            c.style['WebkitTransition'] = '-webkit-transform 0';
            c.style['transition'] = 'transform 0';
        }
        c.style['MozTransform'] = c.style['msTransform'] = c.style['OTransform'] = c.style['webkitTransform'] = c.style['transform'] = transformString;
        c.style['MozTransformOrigin'] = c.style['msTransformOrigin'] = c.style['OTransformOrigin'] = c.style['webkitTransformOrigin'] = c.style['transformOrigin'] = transformOrigin;
        !time && callback && callback();
    };
    this._canvas && setOnElement(this._canvas);
    this._secondaryCanvas && setOnElement(this._secondaryCanvas);
};

Layer.prototype.getIndexOfSprite = function(sprite)
{
    return this._sprites.indexOf(sprite);
};

Layer.prototype.setIndexOfSprite = function(sprite, index)
{
    var currentIndex = this._sprites.indexOf(sprite);
    if (currentIndex != -1 && index != currentIndex)
    {
        if (index > currentIndex)
        {
            for (var i=currentIndex+1; i<=index; i++)
            {
                this._sprites[i].id--;
            }
        }
        else
        {
            for (i=index; i<currentIndex; i++)
            {
                this._sprites[i].id++;
            }
        }
        wade.removeObjectFromArrayByIndex(currentIndex, this._sprites);
        if (this._sprites.length > index)
        {
            this._sprites.splice(index, 0, sprite);
            sprite.id = index + 1;
            return index;
        }
        sprite.id = this._sprites.length + 1;
        return this._sprites.push(sprite) - 1;
    }
    return -1;
};

Layer.prototype.getPixelShader = function(context, shaderSource, customUniforms)
{
    if (this._renderMode != 'webgl')
    {
        wade.log('cannot use pixel shaders in canvas mode');
        return;
    }

    // if shader is in cache, return the cached version
	var pixelShader = context.pixelShaders[shaderSource];
    if (pixelShader)
    {
        return pixelShader;
    }

	// parse parameters
    var paramString = '';
	if (customUniforms)
	{
		for (var p in customUniforms)
		{
			if (customUniforms.hasOwnProperty(p))
			{
				paramString += 'uniform ' + customUniforms[p] + ' ' + p + ';\n';
			}
		}
	}

	// compile
	var fullSource = "precision mediump int; precision mediump float;\n\
	varying vec4 uvAlphaTime;\n\
	uniform sampler2D uDiffuseSampler;\n\
	uniform vec4 uCustomPsParameters;\n" + paramString +
	"void main(void) {\n" + shaderSource + '\n}';
	pixelShader = context.createShader(context.FRAGMENT_SHADER);
	context.shaderSource(pixelShader, fullSource);
	context.compileShader(pixelShader);
	pixelShader.hash = wade.hashString(shaderSource).toString();
	pixelShader.customUniforms = customUniforms;

	// check for errors
	if (!context.getShaderParameter(pixelShader, context.COMPILE_STATUS))
	{
		wade.log("An error occurred compiling a pixel shader: " + context.getShaderInfoLog(pixelShader));
		return;
	}

	// cache it and return it
	context.pixelShaders[shaderSource] = pixelShader;
	return pixelShader;
};

Layer.prototype.getVertexShader = function(context, shaderSource)
{
    if (this._renderMode != 'webgl')
    {
        wade.log('cannot use vertex shaders in canvas mode');
        return;
    }

	// if shader is in cache, return the cached version
	var vertexShader = context.vertexShaders[shaderSource];
	if (vertexShader)
	{
		return vertexShader;
	}

	// compile
	vertexShader = context.createShader(context.VERTEX_SHADER);
	context.shaderSource(vertexShader, shaderSource);
	context.compileShader(vertexShader);
	vertexShader.hash = wade.hashString(shaderSource).toString();

	// check for errors
	if (!context.getShaderParameter(vertexShader, context.COMPILE_STATUS))
	{
		wade.log("An error occurred compiling a vertex shader: " + context.getShaderInfoLog(vertexShader));
		return;
	}

	// cache it and return it
	context.vertexShaders[shaderSource] = vertexShader;
	return vertexShader;

};

Layer.prototype.getShaderProgram = function(context, vertexShader, pixelShader)
{
    if (this._renderMode != 'webgl')
    {
        wade.log('cannot use shader programs in canvas mode');
        return;
    }

	vertexShader = vertexShader || context.defaultVertexShader;
	pixelShader = pixelShader || context.defaultPixelShader;

	// check cache first, return a cached version if available
	var shaderProgram = context.shaderPrograms[vertexShader.hash + pixelShader.hash];
	if (shaderProgram)
	{
		return shaderProgram;
	}

	// link shader program
	shaderProgram = context.createProgram();
	context.attachShader(shaderProgram, vertexShader);
	context.attachShader(shaderProgram, pixelShader);
	context.linkProgram(shaderProgram);
	if (!context.getProgramParameter(shaderProgram, context.LINK_STATUS))
	{
		wade.log('Unable to link a WebGl shader program');
		return;
	}
	shaderProgram.vertexPositionAttribute = context.getAttribLocation(shaderProgram, "aVertexPosition");

	// cache uniform locations
	shaderProgram.uniforms = {};
	shaderProgram.uniforms['uCameraScaleTranslateTime'] = context.getUniformLocation(shaderProgram, 'uCameraScaleTranslateTime');
	shaderProgram.uniforms['uViewportSize'] = context.getUniformLocation(shaderProgram, 'uViewportSize');
	shaderProgram.uniforms['uPositionAndSize'] = context.getUniformLocation(shaderProgram, 'uPositionAndSize');
	shaderProgram.uniforms['uAnimFrameInfo'] = context.getUniformLocation(shaderProgram, 'uAnimFrameInfo');
	shaderProgram.uniforms['uRotationAlpha'] = context.getUniformLocation(shaderProgram, 'uRotationAlpha');
	shaderProgram.uniforms['uDiffuseSampler'] = context.getUniformLocation(shaderProgram, 'uDiffuseSampler');
	if (pixelShader.customUniforms)
	{
		for (var u in pixelShader.customUniforms)
		{
			shaderProgram.uniforms[u] = context.getUniformLocation(shaderProgram, u);
		}
	}

	// cache it and return it
	context.shaderPrograms[vertexShader.hash + pixelShader.hash] = shaderProgram;
	return shaderProgram;
};

Layer.prototype.getDefaultPixelShaderSource = function()
{
	return	"highp vec4 color = texture2D(uDiffuseSampler, uvAlphaTime.xy); \ncolor.w *= uvAlphaTime.z; \ngl_FragColor = color;";
};

Layer.prototype._setupWebGl = function(context, canvas)
{
	// clear
	context.clearColor(0,0,0,0);
	context.clear(context.COLOR_BUFFER_BIT);

    // init shader cache
	context.vertexShaders = {};
    context.pixelShaders = {};
    context.shaderPrograms = {};

	// vertex shader
	var vertexShaderSource = 
	["attribute vec3 aVertexPosition;",
	 "uniform vec4 uCameraScaleTranslateTime;",
	 "uniform vec2 uViewportSize;",
	 "uniform vec4 uPositionAndSize;",
	 "uniform vec4 uAnimFrameInfo;",
	 "uniform vec2 uRotationAlpha;",
	 "varying highp vec4 uvAlphaTime;",
	 "void main(void) {",
	 "float s = sin(uRotationAlpha.x);",
	 "float c = cos(uRotationAlpha.x);",
     "vec2 pos = aVertexPosition.xy * uPositionAndSize.zw;",  // scale
	 "pos = vec2(pos.x * c - pos.y * s, pos.y * c + pos.x * s);",  // rotate
	 "pos += uPositionAndSize.xy * 2.0;",  // translate
	 "pos *= uCameraScaleTranslateTime.x;",  // camera scale
	 "pos -= uCameraScaleTranslateTime.yz * 2.0;",  // camera translate
	 "pos /= uViewportSize;",
	 "pos.y *= -1.0;",
	 "uvAlphaTime.xy = (aVertexPosition.xy + 1.0) * 0.5;",
     "uvAlphaTime.x = (uAnimFrameInfo.z < 0.0)? 1.0 - uvAlphaTime.x : uvAlphaTime.x;",
     "uvAlphaTime.y = (uAnimFrameInfo.w < 0.0)? 1.0 - uvAlphaTime.y : uvAlphaTime.y;",
     "uvAlphaTime.xy *= abs(uAnimFrameInfo.zw);",
	 "uvAlphaTime.xy += uAnimFrameInfo.xy;",
	 "uvAlphaTime.z = uRotationAlpha.y;",
	 "uvAlphaTime.w = uCameraScaleTranslateTime.w;",
	 "gl_Position = vec4(pos, 0.0, 1.0);",
	 "}"].join('\n');
	var vertexShader = context.defaultVertexShader = this.getVertexShader(context, vertexShaderSource);
	
	// pixel shader
	var pixelShaderSource = this.getDefaultPixelShaderSource();
	var pixelShader = context.defaultPixelShader = this.getPixelShader(context, pixelShaderSource);
	
	// link shader program
	var shaderProgram = this.getShaderProgram(context, vertexShader, pixelShader);
	if (!shaderProgram)
	{
		return;
	}
	context.defaultShaderProgram = shaderProgram;
	var that = this;
	context.setShaderProgram = function(shaderProgram)
	{
		if (this.currentShader != shaderProgram)
		{
			this.useProgram(this.currentShader = shaderProgram);
			this.uniform2fv(this.currentShader.uniforms['uViewportSize'], that._f32ViewportSize);
			this.uniform4fv(this.currentShader.uniforms['uCameraScaleTranslateTime'], that._f32CameraScaleTranslateTime);
		}
	};
	context.setShaderProgram(shaderProgram);

	// default vertex buffer for sprites
	var squareVertexBuffer = context.createBuffer();
	var vertices = 
	[
		1.0,  1.0,  0.0,
		-1.0, 1.0,  0.0,
		1.0,  -1.0, 0.0,
		-1.0, -1.0, 0.0
	];
	context.enableVertexAttribArray(shaderProgram.vertexPositionAttribute);
	context.bindBuffer(context.ARRAY_BUFFER, squareVertexBuffer);
	context.bufferData(context.ARRAY_BUFFER, new Float32Array(vertices), context.STATIC_DRAW);
	context.vertexAttribPointer(shaderProgram.vertexPositionAttribute, 3, context.FLOAT, false, 0, 0);

	// initialize diffuse sampler
	context.activeTexture(context.TEXTURE0);
	context.uniform1i(shaderProgram.uniforms["uDiffuseSampler"], 0);

    // render states
    context.disable(context.DEPTH_TEST);
    context.enable(context.BLEND);
    context.blendFuncSeparate(context.SRC_ALPHA, context.ONE_MINUS_SRC_ALPHA, context.ONE, context.ONE_MINUS_SRC_ALPHA);
    context.pixelStorei(context.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

    // texture cache
    context.textures = {};
    context.setTextureImage = function(image, preloadOnly, textureUnit) // called when we want to set a texture before rendering a sprite
    {
		var imageName = image && image.imageName || '';
		textureUnit = textureUnit || 0;
        // if it's the same texture that is currently set, no need to do anything
        if (context.currentImage[textureUnit] == imageName)
        {
            return;
        }

        // if it's a different texture and we have it in our cache, get it from the cache
        if (context.textures[imageName])
        {
            if (!preloadOnly)
            {
                context.bindTexture(context.TEXTURE_2D, context.textures[imageName]);
            }
        }
        else // texture is not in the cache
        {
            if (image)
			{
				var texture = context.createTexture();
				context.bindTexture(context.TEXTURE_2D, texture);
				wade.texImage2D(context, {width: image && image.width || 0, height: image && image.height || 0, image: image});
				context.textures[imageName] = texture;
				wade.addImageUser(imageName, this);
				if (preloadOnly)
				{
					context.bindTexture(context.TEXTURE_2D, null);
					context.currentImage[textureUnit] = null;
				}
			}
			else
			{
				context.currentImage[textureUnit] = null;
			}
        }
        if (!preloadOnly)
        {
            context.currentImage[textureUnit] = imageName;
        }
    };
    context.setActiveImage = function(imageName) // called by WADE when the image changes
    {
        context.bindTexture(context.TEXTURE_2D, context.textures[imageName]);
		var image = wade.getImage(imageName);
        wade.texImage2D(context, {width: image.width, height: image.height, image: image});
    };
    context.onImageUnloaded = function(imageName)
    {
        context.deleteTexture(context.textures[imageName]);
		delete context.textures[imageName];
    };
	context.currentImage = [];
	
	// main render target
    if (this._useOffScreenTarget)
    {
        context.mainRenderTarget = context.createFramebuffer();
        context.bindFramebuffer(context.FRAMEBUFFER, context.mainRenderTarget);
        context.disable(context.DEPTH_TEST);
        context.mainRenderTarget.texture = context.createTexture();
        context.bindTexture(context.TEXTURE_2D, context.mainRenderTarget.texture);
        context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR); // because the texture is NPOT
        context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR); // NPOT ?
        context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE); // NPOT
        context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE); // NPOT
        context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, canvas.width, canvas.height, 0, context.RGBA, context.UNSIGNED_BYTE, null);
        context.framebufferTexture2D(context.FRAMEBUFFER, context.COLOR_ATTACHMENT0, context.TEXTURE_2D, context.mainRenderTarget.texture, 0);
        context.bindTexture(context.TEXTURE_2D, null);
        context.bindFramebuffer(context.FRAMEBUFFER, null);
        context.mainRenderTarget.uniformValues =
        {
            positionAndSize: new Float32Array([0, 0, canvas.width, canvas.height]),
            animFrameInfo: new Float32Array([0, 0, 1, -1]),
            rotationAlpha: new Float32Array([0, 1])
        };
    }

	// global alpha
	context.globalAlpha = 1;
	
	// initial viewport setup
	this._f32ViewportSize[0] = this._canvas.width;
	this._f32ViewportSize[1] = this._canvas.height;
	context.viewport(0, 0, canvas.width, canvas.height);
	context.uniform2fv(shaderProgram.uniforms['uViewportSize'], this._f32ViewportSize);
};

var resetContext = function(context)
{
    var numAttribs = context.getParameter(context.MAX_VERTEX_ATTRIBS);
    var tmp = context.createBuffer();
    context.bindBuffer(context.ARRAY_BUFFER, tmp);
    for (var ii = 0; ii < numAttribs; ++ii)
    {
        context.disableVertexAttribArray(ii);
        context.vertexAttribPointer(ii, 4, context.FLOAT, false, 0, 0);
        context.vertexAttrib1f(ii, 0);
    }
    context.deleteBuffer(tmp);

    var numTextureUnits = context.getParameter(context.MAX_TEXTURE_IMAGE_UNITS);
    for (ii = 0; ii < numTextureUnits; ++ii)
    {
        context.activeTexture(context.TEXTURE0 + ii);
        context.bindTexture(context.TEXTURE_CUBE_MAP, null);
        context.bindTexture(context.TEXTURE_2D, null);
    }

    context.activeTexture(context.TEXTURE0);
    context.useProgram(null);
    context.bindBuffer(context.ARRAY_BUFFER, null);
    context.bindBuffer(context.ELEMENT_ARRAY_BUFFER, null);
    context.bindFramebuffer(context.FRAMEBUFFER, null);
    context.bindRenderbuffer(context.RENDERBUFFER, null);
    context.disable(context.BLEND);
    context.disable(context.CULL_FACE);
    context.disable(context.DEPTH_TEST);
    context.disable(context.DITHER);
    context.disable(context.SCISSOR_TEST);
    context.blendColor(0, 0, 0, 0);
    context.blendEquation(context.FUNC_ADD);
    context.blendFunc(context.ONE, context.ZERO);
    context.clearColor(0, 0, 0, 0);
    context.clearDepth(1);
    context.clearStencil(-1);
    context.colorMask(true, true, true, true);
    context.cullFace(context.BACK);
    context.depthFunc(context.LESS);
    context.depthMask(true);
    context.depthRange(0, 1);
    context.frontFace(context.CCW);
    context.hint(context.GENERATE_MIPMAP_HINT, context.DONT_CARE);
    context.lineWidth(1);
    context.pixelStorei(context.PACK_ALIGNMENT, 4);
    context.pixelStorei(context.UNPACK_ALIGNMENT, 4);
    context.pixelStorei(context.UNPACK_FLIP_Y_WEBGL, false);
    context.pixelStorei(context.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    if (context.UNPACK_COLORSPACE_CONVERSION_WEBGL)
    {
        context.pixelStorei(context.UNPACK_COLORSPACE_CONVERSION_WEBGL, context.BROWSER_DEFAULT_WEBGL);
    }
    context.polygonOffset(0, 0);
    context.sampleCoverage(1, false);
    context.scissor(0, 0, context.canvas.width, context.canvas.height);
    context.stencilFunc(context.ALWAYS, 0, 0xFFFFFFFF);
    context.stencilMask(0xFFFFFFFF);
    context.stencilOp(context.KEEP, context.KEEP, context.KEEP);
    context.viewport(0, 0, context.canvas.width, context.canvas.height);
    context.clear(context.COLOR_BUFFER_BIT | context.DEPTH_BUFFER_BIT | context.STENCIL_BUFFER_BIT);

    // clear texture cache
    for (var t in context.textures)
    {
        if (context.textures.hasOwnProperty(t))
        {
            wade.removeImageUser(t, context);
            context.deleteTexture(context.textures[t]);
        }
    }
    delete context.textures;

    // clear shader cache
    context.shaderPrograms = {};
    context.pixelShaders = {};
    context.vertexShaders = {};
};

Layer.prototype.setRenderMode = function(renderMode, options)
{
    var useOffScreenTarget = options && options.offScreenTarget;
	if (renderMode != this._renderMode || !!useOffScreenTarget != !!this._useOffScreenTarget)
	{
        if (this._renderMode == 'webgl')
        {
            this._context && resetContext(this._context);
        }

		this._renderMode = renderMode;
        this._useOffScreenTarget = useOffScreenTarget;

		// delete canvas(es) and create a new one in webgl mode
		this.removeCanvases();
		this.createCanvas();
        wade.isDoubleBufferingEnabled() && this.createSecondaryCanvas();

        // refresh custom sprite shaders if needed
        if (this._renderMode == 'webgl')
        {
            for (var i=0; i<this._sprites.length; i++)
            {
                this._sprites[i].refreshShader();
            }
        }
	}
};

Layer.prototype.getRenderMode = function()
{
	return this._renderMode;
};

Layer.prototype.getF32ViewportSize = function()
{
	return this._f32ViewportSize;
};
