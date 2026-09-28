"""Convert only the restaurant's lettering into reusable outline data, not a font file."""
import json
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen

font=TTFont('C:/Windows/Fonts/msyh.ttc',fontNumber=0)
glyphs=font.getGlyphSet()
cmap=font.getBestCmap()
units=font['head'].unitsPerEm

class OutlinePen(BasePen):
    def __init__(self):
        super().__init__(glyphs)
        self.commands=[]
    def point(self,p): return [round(float(p[0])/units,6),round(float(p[1])/units,6)]
    def _moveTo(self,p): self.commands.append(['m',*self.point(p)])
    def _lineTo(self,p): self.commands.append(['l',*self.point(p)])
    def _qCurveToOne(self,p1,p2): self.commands.append(['q',*self.point(p1),*self.point(p2)])
    def _curveToOne(self,p1,p2,p3): self.commands.append(['c',*self.point(p1),*self.point(p2),*self.point(p3)])
    def _closePath(self): self.commands.append(['z'])

data={}
for ch in dict.fromkeys('岩洞餐厅CAVE RESTAURANT'):
    pen=OutlinePen()
    glyphs[cmap[ord(ch)]].draw(pen)
    data[ch]={'advance':glyphs[cmap[ord(ch)]].width/units,'commands':pen.commands}
out=Path(__file__).resolve().parents[1]/'models'/'sign-outlines.json'
out.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print(out)
