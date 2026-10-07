import config from "@fitbud/config/eslint/base";

export default [
  ...config,
  {
    languageOptions: {
      globals: {
        require: "readonly",
        module: "readonly",
        __dirname: "readonly",
      },
    },
  },
];
