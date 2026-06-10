import Image from 'next/image';
import { mediaUrl } from '@/lib/media';
import styles from './FleetSection.module.css';

type FleetMedia = Parameters<typeof mediaUrl>[0];

type Props = {
  photo?: FleetMedia;
};

const CATEGORIES = [
  {
    label: '— Tractors',
    items: [
      { name: 'John Deere 6R 250', spec: '7.8 ton · flagship' },
      { name: 'John Deere 4066R', spec: '65 hp · compact utility' },
      { name: 'John Deere 4066M', spec: '65 hp · compact utility' },
      { name: 'John Deere 2038R', spec: '37 hp · tight-space' },
      { name: 'Honda TRX Foreman 520', spec: 'Quad' },
    ],
  },
  {
    label: '— Cutting & topping',
    items: [
      { name: 'Kuhn BP 20', spec: '2.0m flail topper' },
      { name: 'Flail mowers', spec: '2.2m / 1.75m / 0.95m' },
      { name: 'Verge flail', spec: '1.45m' },
      { name: 'Wessex CMT 210', spec: 'Finishing mower' },
      { name: 'Flat topper', spec: 'General topping' },
    ],
  },
  {
    label: '— Ground care',
    items: [
      { name: 'Chapman PC150', spec: 'Field sweeper' },
      { name: 'Dung Beetle', spec: 'Paddock cleaner' },
      { name: 'Flail collector', spec: 'Cut & collect' },
      { name: 'John Deere 1500 Aercore', spec: 'Aeration' },
    ],
  },
  {
    label: '— Soil & seeding',
    items: [
      { name: 'Kuhn EL 62', spec: 'Rotavator' },
      { name: 'SpeedSeed 1500', spec: 'Overseeder' },
      { name: 'Winton WSS145', spec: 'Stone burier / seeder' },
      { name: 'Deleks mole plough', spec: 'Mole ploughing' },
      { name: 'Pipe layer / subsoiler', spec: 'Drainage' },
    ],
  },
  {
    label: '— Spraying',
    items: [{ name: 'Boom sprayer', spec: 'PA1/PA2 licensed' }],
  },
];

export function FleetSection({ photo }: Props) {
  const photoUrl = mediaUrl(photo, 'feature') ?? mediaUrl(photo);
  const photoAlt =
    (typeof photo === 'object' && photo?.alt) ||
    'John Deere fleet at Hampshire Paddock Management';

  return (
    <section className={styles.fleet} id="fleet">
      <div className={styles.head}>
        <div className={styles.eyebrow}>The fleet</div>
        <h2 className={styles.title}>
          Four John Deeres, <em>sixteen implements,</em> and the range to match.
        </h2>
        <p className={styles.sub}>
          Not too big, not too small. A modern compact fleet chosen specifically
          for paddock work — with the reach of a main dealer behind it when scale
          is needed.
        </p>
      </div>

      <div className={styles.inner}>
        <div className={styles.photo}>
          {photoUrl && (
            <Image
              src={photoUrl}
              alt={photoAlt}
              fill
              sizes="(max-width: 900px) 100vw, 50vw"
              quality={60}
              style={{ objectFit: 'cover' }}
            />
          )}
        </div>

        <div>
          {CATEGORIES.map((cat) => (
            <div key={cat.label} className={styles.category}>
              <div className={styles.categoryLabel}>{cat.label}</div>
              <ul className={styles.list}>
                {cat.items.map((item) => (
                  <li key={item.name}>
                    <span className={styles.name}>{item.name}</span>
                    <span className={styles.spec}>{item.spec}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className={styles.partnerNote}>
            <strong>Hunt Forest Group partnership.</strong> Our John Deere
            machinery is kept up-to-date and backed by a full agricultural main
            dealer — which means if something bigger is needed, we can source it.
          </div>
        </div>
      </div>
    </section>
  );
}
