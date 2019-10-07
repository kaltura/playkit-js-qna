import { h, Component } from "preact";
import * as styles from "./trimmedText.scss";
import { LinkifyString } from "@playkit-js-contrib/linkify";

interface TrimmedTextProps {
    maxLength: number;
    text: string | undefined;
}

interface TrimmedTextState {
    isTrimmed: boolean;
}

export class TrimmedText extends Component<TrimmedTextProps, TrimmedTextState> {
    static defaultProps = {};

    state = {
        isTrimmed: true
    };

    onTrimmedTextClick = () => {
        this.setState({ isTrimmed: !this.state.isTrimmed });
    };

    render() {
        const { maxLength, text } = this.props;
        const { isTrimmed } = this.state;

        return text && text.length > maxLength ? (
            <span>
                <span className={styles.text}>
                    <LinkifyString
                        text={isTrimmed ? `${text.substring(0, maxLength).trim()}...` : text}
                    />
                </span>
                <button
                    className={styles.showMoreOrLess}
                    onClick={this.onTrimmedTextClick}
                    type={"button"}
                >
                    {isTrimmed ? "Show more" : "Show less"}
                </button>
            </span>
        ) : (
            <span className={styles.text}>
                <LinkifyString text={text || ""} />
            </span>
        );
    }
}
