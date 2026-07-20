import { useTranslation } from 'react-i18next';
import EvaluationView from '../english-training/EvaluationView';

export default function EvaluationPanel() {
  const { t } = useTranslation();
  return <EvaluationView t={t} />;
}
