const transparent = /^(?:transparent|#0{4}|#0{8}|rgba?\(\s*0(?:(?:\s*,\s*0){3}|(?:\s+0){2}\s*\/\s*0)\s*\))$/iu;
let ctx: OffscreenCanvasRenderingContext2D | undefined;

export const rgba = (color: string): [number, number, number, number] | [] => {
	ctx ??= new OffscreenCanvas(1, 1)
		.getContext('2d', {alpha: true, willReadFrequently: true})!;
	ctx.fillStyle = 'transparent';
	ctx.fillStyle = color;
	if (ctx.fillStyle === 'rgba(0, 0, 0, 0)' && !transparent.test(color)) {
		return [];
	}
	ctx.clearRect(0, 0, 1, 1);
	ctx.fillRect(0, 0, 1, 1);
	const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
	return [r!, g!, b!, a! / 255];
};
