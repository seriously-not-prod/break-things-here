import { createApp } from './app';

const PORT = process.env.PORT ?? '3000';

const app = createApp();

app.listen(parseInt(PORT, 10), () => {
  console.log(`Server running on port ${PORT}`);
});
