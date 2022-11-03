import {h} from 'preact';
import * as styles from './pluginButton.scss';
import {ui} from 'kaltura-player-js';
import {A11yWrapper, OnClick} from '@playkit-js/common';
import {icons} from '../icons';

const {Tooltip, Icon} = KalturaPlayer.ui.components;
const {withText, Text} = KalturaPlayer.ui.preacti18n;

export interface MenuIconProps {
  showIndication: boolean;
}

const translates = ({isActive}: QnaPluginButtonProps) => {
  return {
    label: isActive ? <Text id="qna.hide_plugin">Hide QnA</Text> : <Text id="qna.show_plugin">Show QnA</Text>
  };
};

interface QnaPluginButtonProps {
  isActive: boolean;
  onClick: OnClick;
  showIndication?: boolean;
  label?: string;
}

export const QnaPluginButton = withText(translates)(({isActive, onClick, showIndication, ...otherProps}: QnaPluginButtonProps) => {
  return (
    <Tooltip label={otherProps.label} type="bottom">
      <A11yWrapper onClick={onClick}>
        <button aria-label={otherProps.label} className={[ui.style.upperBarIcon, styles.qnaPluginButton, isActive ? styles.active : ''].join(' ')}>
          <Icon
            id="navigation-plugin-button"
            height={icons.BigSize}
            width={icons.BigSize}
            viewBox={`0 0 ${icons.BigSize} ${icons.BigSize}`}
            path={icons.PLUGIN_ICON}
          />
          {showIndication && <span className={styles.indicator} />}
        </button>
      </A11yWrapper>
    </Tooltip>
  );
});

QnaPluginButton.defaultProps = {
  showIndication: false
};
