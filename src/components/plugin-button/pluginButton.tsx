export interface MenuIconProps {
  showIndication: boolean;
}

import {h} from 'preact';
import * as styles from './pluginButton.scss';
import {A11yWrapper, OnClick} from '../a11y-wrapper';

const {Tooltip, Icon} = KalturaPlayer.ui.components;
const {withText, Text} = KalturaPlayer.ui.preacti18n;

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
        <button aria-label={otherProps.label} className={[styles.qnaPluginButton, isActive ? styles.active : ''].join(' ')}>
          <svg
            width="32px"
            height="32px"
            viewBox="0 0 32 32"
            version="1.1"
            xmlns="http://www.w3.org/2000/svg"
            xmlnsXlink="http://www.w3.org/1999/xlink">
            <g id="Icons/32/message" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
              <g id="Group" transform="translate(3.000000, 5.000000)">
                <path
                  d="M7,21.5091539 L11.5753656,17 L22,17 C23.6568542,17 25,15.6568542 25,14 L25,4 C25,2.34314575 23.6568542,1 22,1 L4,1 C2.34314575,1 1,2.34314575 1,4 L1,14 C1,15.6568542 2.34314575,17 4,17 L7,17 L7,21.5091539 Z"
                  id="Combined-Shape"
                  stroke="#FFFFFF"
                  stroke-width="2"></path>
                <rect id="Rectangle-Copy" fill="#FFFFFF" x="6" y="6" width="15" height="2" rx="1"></rect>
                <rect id="Rectangle-Copy-2" fill="#FFFFFF" x="6" y="10" width="11" height="2" rx="1"></rect>
              </g>
            </g>
          </svg>
          {showIndication && <span className={styles.indicator} />}
        </button>
      </A11yWrapper>
    </Tooltip>
  );
});

QnaPluginButton.defaultProps = {
  showIndication: false
};
