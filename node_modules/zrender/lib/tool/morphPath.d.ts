import PathProxy from '../core/PathProxy';
import Path from '../graphic/Path';
import Element, { ElementAnimateConfig } from '../Element';
interface CombiningPath extends Path {
    __combiningSubList: Path[];
    __oldAddSelfToZr: Element['addSelfToZr'];
    __oldRemoveSelfFromZr: Element['removeSelfFromZr'];
    __oldBuildPath: Path['buildPath'];
    childrenRef(): Path[];
}
export declare type MorphDividingMethod = 'split' | 'duplicate';
export interface CombineSeparateConfig extends ElementAnimateConfig {
    dividingMethod?: MorphDividingMethod;
}
export interface CombineSeparateResult {
    fromIndividuals: Path[];
    toIndividuals: Path[];
    count: number;
}
export declare function pathToBezierCurves(path: PathProxy): number[][];
export declare function alignBezierCurves(array1: number[][], array2: number[][]): number[][][];
export declare function centroid(array: number[]): number[];
export declare function morphPath(fromPath: Path, toPath: Path, animationOpts: ElementAnimateConfig): Path;
export declare function isCombiningPath(path: Path): path is CombiningPath;
export declare function isInAnyMorphing(path: Path): boolean;
export declare function combine(fromPathList: Path[], toPath: Path, animationOpts: CombineSeparateConfig, copyPropsIfDivided?: (srcPath: Path, tarPath: Path, needClone: boolean) => void): CombineSeparateResult;
export declare function separate(fromPath: Path, toPathList: Path[], animationOpts: CombineSeparateConfig, copyPropsIfDivided?: (srcPath: Path, tarPath: Path, needClone: boolean) => void): CombineSeparateResult;
export {};
