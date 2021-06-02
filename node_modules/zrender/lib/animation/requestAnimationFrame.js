var requestAnimationFrame;
requestAnimationFrame = (typeof window !== 'undefined'
    && ((window.requestAnimationFrame && window.requestAnimationFrame.bind(window))
        || (window.msRequestAnimationFrame && window.msRequestAnimationFrame.bind(window))
        || window.mozRequestAnimationFrame
        || window.webkitRequestAnimationFrame)) || function (func) {
    return setTimeout(func, 16);
};
export default requestAnimationFrame;
