/*This file just contains useful snippets that I dont want to delete, perhaps i am too sentimental*/

/* this shader distorts in the XZ plane to make the objects look non-uniform
*/
function onBeforeCompileOld( shader ) {
    shader.vertexShader = `attribute vec2 visiblevertices;
attribute float myVertexIndex;
${shader.vertexShader}`
.replace('#include <project_vertex>',`
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
float angle = PI*(cos(${173*cellSize}*mvPosition.x) + sin(${173*cellSize}*mvPosition.y));
float offsetX = sin(mvPosition.x*50.0);
float offsetY = cos(mvPosition.x*50.0);
offsetX = offsetX*cos(angle) - offsetY*sin(angle);
offsetY = offsetX*sin(angle) + offsetY*cos(angle);
mvPosition = modelViewMatrix * (mvPosition + ${0.15*cellSize}*vec4(offsetX,0.0,offsetY,0.0)) * float(myVertexIndex >= visiblevertices[0] && myVertexIndex <= visiblevertices[1]);
gl_Position = projectionMatrix * mvPosition;
    `);
};