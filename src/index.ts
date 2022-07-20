import {QnaPlugin} from './qna-plugin';

declare var __VERSION__: string;
declare var __NAME__: string;

const VERSION = __VERSION__;
const NAME = __NAME__;

export {QnaPlugin as Plugin};
export {VERSION, NAME};

const pluginName: string = 'qna';
KalturaPlayer.core.registerPlugin(pluginName, QnaPlugin);
