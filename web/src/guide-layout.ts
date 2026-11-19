type Bounds = Pick<DOMRectReadOnly,'left'|'right'|'top'|'bottom'>;

export function avoidInstrumentPanel(x:number,y:number,width:number,height:number,panel:Bounds) {
  const halfWidth=width/2+8, halfHeight=height/2+8;
  if (x+halfWidth<=panel.left || x-halfWidth>=panel.right ||
      y+halfHeight<=panel.top || y-halfHeight>=panel.bottom) return {x,y};
  const left=panel.left-halfWidth, below=panel.bottom+halfHeight;
  return left>=halfWidth && x-left<=below-y ? {x:left,y} : {x,y:below};
}

export function ringGuidePlacement(guide:HTMLElement,instruments:HTMLElement) {
  let panel:Bounds, width=0, height=0;
  let x=0,y=0;
  const update=()=>{
    const point=avoidInstrumentPanel(x,y,width,height,panel);
    guide.style.left=`${point.x}px`;
    guide.style.top=`${point.y}px`;
  };
  const measure=()=>{
    panel=instruments.getBoundingClientRect();
    width=guide.offsetWidth;
    height=guide.offsetHeight;
    if (!guide.hidden) update();
  };
  measure();
  const observer=new ResizeObserver(measure);
  observer.observe(instruments,{box:'border-box'});
  observer.observe(guide);
  window.addEventListener('resize',measure);
  return (nextX:number,nextY:number)=>{
    x=nextX; y=nextY;
    update();
  };
}
