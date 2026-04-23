import React from 'react';
import useReveal from '../../hooks/useReveal';
import FVMono from '../FVMono';
import '../../Style/Contact.scss';

const LINKS = [
  {
    label: 'Email',
    href: 'mailto:fra.vittecoq@gmail.com',
    icon: '✉',
  },
  {
    label: 'GitHub',
    href: 'https://github.com/FrancoisV34',
    icon: '◉',
  },
  {
    label: 'LinkedIn',
    href: 'https://linkedin.com/in/francoisvittecoq',
    icon: 'in',
  },
];

export default function Contact() {
  const ref = useReveal(0.1);

  return (
    <section id="contact" ref={ref} className="contact-footer">
      <div className="contact-footer__inner">
        <p className="eyebrow reveal">Contact</p>
        <h2 className="contact-footer__title reveal reveal-delay-1">
          Travaillons
          <br />
          ensemble.
        </h2>
        <p className="contact-footer__lead reveal reveal-delay-2">
          Je suis disponible pour des missions freelance, alternances et CDI.
          N'hésitez pas à me contacter.
        </p>

        <ul className="contact-footer__links reveal reveal-delay-3">
          {LINKS.map((link) => (
            <li key={link.label}>
              <a
                href={link.href}
                target={link.href.startsWith('http') ? '_blank' : undefined}
                rel={
                  link.href.startsWith('http') ? 'noopener noreferrer' : undefined
                }
                className="contact-footer__link"
              >
                <span className="contact-footer__icon">{link.icon}</span>
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="contact-footer__bar">
          <FVMono size={28} light={false} />
          <span className="contact-footer__copy">
            © {new Date().getFullYear()} François Vittecoq
          </span>
          <a
            href={`${process.env.PUBLIC_URL}/CVVittecoq.pdf`}
            className="contact-footer__cv"
            target="_blank"
            rel="noopener noreferrer"
          >
            CVVittecoq.pdf ↓
          </a>
        </div>
      </div>
    </section>
  );
}
