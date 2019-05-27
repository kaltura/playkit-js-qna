import { h, Component } from "preact";
import * as styles from "./kitchenSink.scss";

export interface KitchenSinkProps {
    onClose: () => void;
}

export class KitchenSink extends Component<KitchenSinkProps> {
    render(props: KitchenSinkProps) {
        const { onClose } = props;
        return (
            <div className={styles.root}>
                <div className={styles.header}>
                    <div className={styles.title}>Notifications</div>
                    <div className={styles.closeButton} onClick={onClose} />
                </div>
                <div className={styles.main}>
                    <div className={styles.mainImage} />
                </div>
            </div>
        );
    }
}
