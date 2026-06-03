import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google, // 引数は何も書かなくてOKです！自動で環境変数を認識します
  ],
});