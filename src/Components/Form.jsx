import React, { useRef } from 'react';
import emailjs from '@emailjs/browser';

export default function ContactForm() {
  const form = useRef();

  const sendEmail = (e) => {
    e.preventDefault();

    emailjs
      .sendForm(
        'service_9kso4kj', // Service ID
        'template_9v4d5jp', // Template ID
        form.current, // Form reference
        'L2oGIgw_hs5s9Hfia' // Public key
      )
      .then(
        (result) => {
          console.log('Email envoyé :', result.text);
          alert('Message envoyé !');
        },
        (error) => {
          console.log('Erreur :', error.text);
          alert("Erreur lors de l'envoi.");
        }
      );
  };
  return (
    <form ref={form} onSubmit={sendEmail} className="contact" id="contact">
      <label htmlFor="nom">Nom</label>
      <input
        type="text"
        name="user_name"
        id="nom"
        placeholder="Votre nom :"
        required
      />

      <label htmlFor="email">Email :</label>
      <input
        type="email"
        name="user_email"
        id="email"
        placeholder="Votre adresse mail :"
        required
      />
      <label htmlFor="object">Objet du message :</label>
      <input
        type="text"
        name="Object"
        id="email"
        placeholder="De quoi voulez-vous me parler ?"
        required
      />

      <label>Message :</label>
      <textarea
        name="message"
        id="message"
        rows="5"
        placeholder="Je souhaite vous contacter pour [...] : (n'oubliez pas de dire bonjour 😁)"
        required
      />

      <button type="submit" className="submit-btn">
        Envoyer
      </button>
    </form>
  );
}
