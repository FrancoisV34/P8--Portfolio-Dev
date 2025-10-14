import '../Style/Parcours.scss';
import presentation from '../Data/Presentation.json';

export default function Parcours() {
  const parcoursData = presentation[0].parcoursData;

  return (
    <>
      <h2>Mon parcours</h2>
      <ul className="parcours-ul">
        {parcoursData.map((parcours) => (
          <li
            key={parcours.annee}
            className={`${parcours.formation} parcours-item`}
          >
            {parcours.formation} :
            <ul className="annee-experience">
              <li className="data">
                {parcours.annee}: {parcours.experience}
              </li>
            </ul>
          </li>
        ))}
      </ul>
    </>
  );
}
